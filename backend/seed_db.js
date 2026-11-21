const { Client } = require('pg');
require('dotenv').config();

async function seed() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB for seeding...');

    // 1. Seed Support Agents
    const userRes = await client.query(`
      INSERT INTO users (name, email, role)
      VALUES 
        ('Meera Support Lead', 'meera@arvo.com', 'LEAD'),
        ('Agent Rahul', 'rahul@arvo.com', 'AGENT'),
        ('Agent Priya', 'priya@arvo.com', 'AGENT')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name, email;
    `);
    const agents = userRes.rows;
    const agent1 = agents[0].id;
    const agent2 = agents[1].id;

    console.log('Seeded Users/Agents.');

    // 2. Seed Sample Tickets
    const ticketRes = await client.query(`
      INSERT INTO tickets (title, description, status, severity, assigned_agent_id)
      VALUES 
        (
          'Customer cannot login to billing dashboard', 
          'Main portal returns 500 error on login page. Customer is completely blocked.', 
          'OPEN', 
          'CRITICAL', 
          NULL
        ),
        (
          'Export CSV button missing on reports', 
          'When navigating to monthly analytics, export button is disabled.', 
          'WAITING_ON_CUSTOMER', 
          'MEDIUM', 
          $1
        ),
        (
          'Minor typo on settings landing page', 
          'Heading says "Preferenceses" instead of "Preferences".', 
          'OPEN', 
          'LOW', 
          $2
        )
      RETURNING id, title, severity;
    `, [agent1, agent2]);

    const tickets = ticketRes.rows;
    console.log(`Seeded ${tickets.length} initial tickets.`);

    // 3. Seed Sample Audit Log Events (INC-0318 compliance)
    await client.query(`
      INSERT INTO ticket_events (ticket_id, actor_id, action, metadata)
      VALUES 
        ($1, $2, 'TICKET_CREATED', '{"severity": "CRITICAL"}'),
        ($3, $4, 'TICKET_TAKEN', '{"assigned_to": "Agent Priya"}');
    `, [tickets[0].id, agent1, tickets[2].id, agent2]);

    console.log('Seeded initial audit events.');
    console.log('Seeding completed successfully!');
  } catch (err) {
    console.error('Error seeding data:', err);
  } finally {
    await client.end();
  }
}

seed();