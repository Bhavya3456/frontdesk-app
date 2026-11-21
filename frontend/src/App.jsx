import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function App() {
  const [users, setUsers] = useState([]);
  const [currentAgentId, setCurrentAgentId] = useState('');
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [messageBody, setMessageBody] = useState('');
  const [messageType, setMessageType] = useState('PUBLIC_REPLY');
  const [banner, setBanner] = useState(null);
  const [loading, setLoading] = useState(false);

  function notify(type, text) {
    setBanner({ type, text });
    setTimeout(() => setBanner(null), 4500);
  }

  async function loadUsers() {
    const res = await fetch(`${API_URL}/api/users`);
    const data = await res.json();
    setUsers(data);
    if (data.length > 0 && !currentAgentId) {
      setCurrentAgentId(data[0].id);
    }
  }

  async function loadTickets() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/tickets`);
      const data = await res.json();
      setTickets(data);
      if (!selectedTicketId && data.length > 0) {
        setSelectedTicketId(data[0].id);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadTicketDetail(id) {
    if (!id) return;
    const res = await fetch(`${API_URL}/api/tickets/${id}`);
    if (res.ok) {
      const data = await res.json();
      setDetail(data);
    }
  }

  useEffect(() => {
    loadUsers();
    loadTickets();
  }, []);

  useEffect(() => {
    if (selectedTicketId) {
      loadTicketDetail(selectedTicketId);
    }
  }, [selectedTicketId]);

  async function handleClaimTicket(ticketId) {
    const res = await fetch(`${API_URL}/api/tickets/${ticketId}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: currentAgentId }),
    });
    const data = await res.json();
    if (!res.ok) {
      notify('error', data.error || 'Could not claim ticket');
    } else {
      notify('success', 'Ticket claimed!');
    }
    await loadTickets();
    await loadTicketDetail(ticketId);
  }

  async function handlePostMessage(e) {
    e.preventDefault();
    if (!messageBody.trim() || !selectedTicketId) return;

    const res = await fetch(`${API_URL}/api/tickets/${selectedTicketId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_id: currentAgentId,
        type: messageType,
        body: messageBody.trim(),
      }),
    });

    if (res.ok) {
      setMessageBody('');
      notify(
        'success',
        messageType === 'INTERNAL_NOTE'
          ? 'Private team note saved (hidden from customer)'
          : 'Customer reply sent'
      );
      await loadTickets();
      await loadTicketDetail(selectedTicketId);
    } else {
      notify('error', 'Failed to save message');
    }
  }

  async function handleUpdateTicket(patch) {
    if (!selectedTicketId) return;
    const res = await fetch(`${API_URL}/api/tickets/${selectedTicketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...patch, actor_id: currentAgentId }),
    });
    if (res.ok) {
      notify('success', 'Ticket updated');
      await loadTickets();
      await loadTicketDetail(selectedTicketId);
    }
  }

  const filteredTickets = tickets.filter((t) => {
    if (filter === 'LATE') return t.sla?.isLate;
    if (filter === 'WAITING') return t.status === 'WAITING_ON_CUSTOMER';
    if (filter === 'OPEN') return t.status === 'OPEN';
    return true;
  });

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1200, margin: '0 auto', padding: 20 }}>
      {/* Top Bar */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #ddd', paddingBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Frontdesk — Agent Console</h1>
          <small style={{ color: '#555' }}>Arvo Systems Support • Working Hours: Mon–Fri 09:30–18:30</small>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="agent-select"><strong>Acting as:</strong></label>
          <select
            id="agent-select"
            value={currentAgentId}
            onChange={(e) => setCurrentAgentId(e.target.value)}
            style={{ padding: 6 }}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>
          <button onClick={() => { loadTickets(); loadTicketDetail(selectedTicketId); }} style={{ padding: '6px 10px' }}>
            Refresh
          </button>
        </div>
      </header>

      {/* Notification Banner */}
      {banner && (
        <div
          style={{
            padding: 10,
            marginBottom: 14,
            borderRadius: 6,
            background: banner.type === 'error' ? '#fde8e8' : '#e6f7ed',
            color: banner.type === 'error' ? '#9b1c1c' : '#1e4620',
            border: `1px solid ${banner.type === 'error' ? '#f8b4b4' : '#84e1bc'}`,
          }}
        >
          {banner.text}
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          ['ALL', `All (${tickets.length})`],
          ['LATE', `Late (${tickets.filter((t) => t.sla?.isLate).length})`],
          ['WAITING', `Waiting on Customer (${tickets.filter((t) => t.status === 'WAITING_ON_CUSTOMER').length})`],
          ['OPEN', `Open (${tickets.filter((t) => t.status === 'OPEN').length})`],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '6px 12px',
              fontWeight: filter === key ? 'bold' : 'normal',
              background: filter === key ? '#111827' : '#f3f4f6',
              color: filter === key ? '#fff' : '#111827',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Main Two-Column Agent Screen */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr', gap: 20, alignItems: 'start' }}>
        {/* Left: Ticket Queue */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Tickets {loading ? '(loading...)' : ''}</h2>
          {filteredTickets.length === 0 && <p style={{ color: '#666' }}>No tickets in this filter.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredTickets.map((t) => {
              const isSelected = t.id === selectedTicketId;
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTicketId(t.id)}
                  style={{
                    padding: 12,
                    borderRadius: 6,
                    cursor: 'pointer',
                    border: isSelected ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    background: isSelected ? '#eff6ff' : '#fff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{t.title}</strong>
                    <span style={{ fontSize: 12, fontWeight: 'bold' }}>{t.severity}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#4b5563', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <span>Status: <strong>{t.status}</strong></span>
                    <span>SLA: <strong>{t.sla?.statusText}</strong></span>
                    <span>Owner: <strong>{t.assigned_agent_name || 'Unassigned'}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Ticket Detail & Actions */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          {!detail ? (
            <p style={{ color: '#666' }}>Select a ticket to view details, reply, or add an internal note.</p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18 }}>{detail.ticket.title}</h2>
                  <p style={{ margin: '6px 0 12px', color: '#374151' }}>{detail.ticket.description}</p>
                </div>
                {!detail.ticket.assigned_agent_id ? (
                  <button
                    onClick={() => handleClaimTicket(detail.ticket.id)}
                    style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Take This Ticket
                  </button>
                ) : (
                  <span style={{ fontSize: 13, background: '#f3f4f6', padding: '6px 10px', borderRadius: 6 }}>
                    Assigned: <strong>{detail.ticket.assigned_agent_name}</strong>
                  </span>
                )}
              </div>

              {/* Status & Severity Controls */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #eee' }}>
                <label>
                  Status:{' '}
                  <select
                    value={detail.ticket.status}
                    onChange={(e) => handleUpdateTicket({ status: e.target.value })}
                  >
                    <option value="OPEN">OPEN</option>
                    <option value="WAITING_ON_CUSTOMER">WAITING_ON_CUSTOMER</option>
                    <option value="RESOLVED">RESOLVED</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                </label>

                <label>
                  Severity:{' '}
                  <select
                    value={detail.ticket.severity}
                    onChange={(e) => handleUpdateTicket({ severity: e.target.value })}
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </label>
              </div>

              {/* Messages & Private Notes */}
              <h3 style={{ fontSize: 15, marginTop: 0 }}>Conversation & Team Notes</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, maxHeight: 240, overflowY: 'auto' }}>
                {detail.messages.length === 0 && (
                  <p style={{ color: '#6b7280', fontSize: 13 }}>No replies or notes yet.</p>
                )}
                {detail.messages.map((m) => {
                  const isInternal = m.type === 'INTERNAL_NOTE';
                  return (
                    <div
                      key={m.id}
                      style={{
                        padding: 10,
                        borderRadius: 6,
                        background: isInternal ? '#fef9c3' : '#f9fafb',
                        border: `1px solid ${isInternal ? '#eab308' : '#e5e7eb'}`,
                      }}
                    >
                      <div style={{ fontSize: 12, marginBottom: 4 }}>
                        <strong>{m.author_name}</strong> •{' '}
                        <span style={{ fontWeight: 'bold', color: isInternal ? '#854d0e' : '#1d4ed8' }}>
                          {isInternal ? 'PRIVATE TEAM NOTE (Customer Never Sees)' : 'CUSTOMER REPLY'}
                        </span>{' '}
                        • {new Date(m.created_at).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 14 }}>{m.body}</div>
                    </div>
                  );
                })}
              </div>

              {/* Reply / Note Form */}
              <form onSubmit={handlePostMessage} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                  <label>
                    <input
                      type="radio"
                      name="msgType"
                      value="PUBLIC_REPLY"
                      checked={messageType === 'PUBLIC_REPLY'}
                      onChange={() => setMessageType('PUBLIC_REPLY')}
                    />{' '}
                    Reply to Customer
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="msgType"
                      value="INTERNAL_NOTE"
                      checked={messageType === 'INTERNAL_NOTE'}
                      onChange={() => setMessageType('INTERNAL_NOTE')}
                    />{' '}
                    Private Note (Team Only)
                  </label>
                </div>
                <textarea
                  rows={3}
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  placeholder={
                    messageType === 'INTERNAL_NOTE'
                      ? 'Write a private note for the team...'
                      : 'Write a reply to send to the customer...'
                  }
                  style={{ width: '100%', padding: 8, boxSizing: 'border-box', marginBottom: 8 }}
                />
                <button type="submit" style={{ padding: '7px 14px', cursor: 'pointer' }}>
                  {messageType === 'INTERNAL_NOTE' ? 'Save Private Note' : 'Send Customer Reply'}
                </button>
              </form>

              {/* Immutable Audit Trail (INC-0318) */}
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>Audit Trail (Read-Only History)</h3>
              <ul style={{ fontSize: 12, color: '#374151', paddingLeft: 18, margin: 0 }}>
                {detail.audit_events.map((ev) => (
                  <li key={ev.id} style={{ marginBottom: 4 }}>
                    <strong>{new Date(ev.created_at).toLocaleString()}</strong> — <strong>{ev.actor_name}</strong> performed{' '}
                    <code>{ev.action}</code> {ev.metadata ? JSON.stringify(ev.metadata) : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}