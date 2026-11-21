const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const { calculateTicketSlaStatus } = require('./sla_engine');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Helper: Log audit event (INC-0318 compliance[cite: 4])
async function logAuditEvent(client, ticketId, actorId, action, metadata = {}) {
  await client.query(
    `INSERT INTO ticket_events (ticket_id, actor_id, action, metadata)
     VALUES ($1, $2, $3, $4)`,
    [ticketId, actorId, action, JSON.stringify(metadata)]
  );
}

// 1. GET ALL AGENTS (For UI dropdowns)
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, role FROM users ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET ALL TICKETS (Includes computed SLA status[cite: 3])
app.get('/api/tickets', async (req, res) => {
  try {
    const holidaysRes = await pool.query('SELECT holiday_date FROM business_holidays');
    const holidays = holidaysRes.rows.map(h => h.holiday_date.toISOString().split('T')[0]);

    const ticketsRes = await pool.query(`
      SELECT t.*, u.name as assigned_agent_name
      FROM tickets t
      LEFT JOIN users u ON t.assigned_agent_id = u.id
      ORDER BY t.created_at DESC
    `);

    const ticketsWithSla = ticketsRes.rows.map(ticket => {
      const sla = calculateTicketSlaStatus(ticket, holidays);
      return { ...ticket, sla };
    });

    res.json(ticketsWithSla);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GET SINGLE TICKET WITH MESSAGES & AUDIT TRAIL
// (Solves INC-0304 by allowing parameter filtering for internal notes[cite: 4])
app.get('/api/tickets/:id', async (req, res) => {
  const { id } = req.params;
  const isCustomerView = req.query.view === 'customer'; // INC-0304 safeguard[cite: 4]

  try {
    const ticketRes = await pool.query(
      `SELECT t.*, u.name as assigned_agent_name 
       FROM tickets t 
       LEFT JOIN users u ON t.assigned_agent_id = u.id 
       WHERE t.id = $1`, 
      [id]
    );

    if (ticketRes.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketRes.rows[0];

    // Filter out INTERNAL_NOTE if viewed from customer context (INC-0304[cite: 4])
    let messageQuery = `
      SELECT m.*, u.name as author_name 
      FROM ticket_messages m 
      JOIN users u ON m.author_id = u.id 
      WHERE m.ticket_id = $1
    `;
    const params = [id];

    if (isCustomerView) {
      messageQuery += ` AND m.type = 'PUBLIC_REPLY'`;
    }

    messageQuery += ` ORDER BY m.created_at ASC`;
    const messagesRes = await pool.query(messageQuery, params);

    // Audit logs (INC-0318 compliance[cite: 4])
    const eventsRes = await pool.query(
      `SELECT e.*, u.name as actor_name 
       FROM ticket_events e 
       JOIN users u ON e.actor_id = u.id 
       WHERE e.ticket_id = $1 
       ORDER BY e.created_at ASC`,
      [id]
    );

    res.json({
      ticket,
      messages: messagesRes.rows,
      audit_events: isCustomerView ? [] : eventsRes.rows // Hide audit logs from customer view
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. CLAIM / TAKE TICKET (Solves INC-0291: Race Condition Prevention[cite: 4])
app.post('/api/tickets/:id/claim', async (req, res) => {
  const { id } = req.params;
  const { agent_id } = req.body;

  if (!agent_id) {
    return res.status(400).json({ error: 'agent_id is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Atomic update with database lock checking if already claimed (INC-0291[cite: 4])
    const updateRes = await client.query(
      `UPDATE tickets 
       SET assigned_agent_id = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND assigned_agent_id IS NULL 
       RETURNING *`,
      [agent_id, id]
    );

    if (updateRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ 
        error: 'Ticket has already been claimed by another agent!' 
      });
    }

    // Log to immutable audit ledger (INC-0318[cite: 4])
    await logAuditEvent(client, id, agent_id, 'TICKET_TAKEN', { assigned_agent_id: agent_id });

    await client.query('COMMIT');
    res.json({ message: 'Ticket claimed successfully', ticket: updateRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 5. POST A MESSAGE / NOTE ON A TICKET (Solves INC-0304 & INC-0318[cite: 4])
app.post('/api/tickets/:id/messages', async (req, res) => {
  const { id } = req.params;
  const { author_id, type, body } = req.body; // type: 'PUBLIC_REPLY' | 'INTERNAL_NOTE'[cite: 4]

  if (!author_id || !type || !body) {
    return res.status(400).json({ error: 'author_id, type, and body are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Save message
    const msgRes = await client.query(
      `INSERT INTO ticket_messages (ticket_id, author_id, type, body)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, author_id, type, body]
    );

    // If agent posts public reply, switch status away from WAITING_ON_CUSTOMER[cite: 3]
    if (type === 'PUBLIC_REPLY') {
      await client.query(
        `UPDATE tickets SET status = 'WAITING_ON_CUSTOMER', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );
    }

    // Log immutable event (INC-0318[cite: 4])
    const eventType = type === 'INTERNAL_NOTE' ? 'INTERNAL_NOTE_ADDED' : 'PUBLIC_REPLY_SENT';
    await logAuditEvent(client, id, author_id, eventType, { message_id: msgRes.rows[0].id });

    await client.query('COMMIT');
    res.json(msgRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 6. UPDATE TICKET STATUS / SEVERITY
app.patch('/api/tickets/:id', async (req, res) => {
  const { id } = req.params;
  const { status, severity, actor_id } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let updateFields = [];
    let values = [];
    let idx = 1;

    if (status) {
      updateFields.push(`status = $${idx++}`);
      values.push(status);
    }
    if (severity) {
      updateFields.push(`severity = $${idx++}`);
      values.push(severity);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(id);
    const updateQuery = `UPDATE tickets SET ${updateFields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await client.query(updateQuery, values);

    if (actor_id) {
      await logAuditEvent(client, id, actor_id, 'TICKET_UPDATED', { status, severity });
    }

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Frontdesk API running on port ${PORT}`);
});