-- Enable UUID extension (PostgreSQL)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum types for strict data validation
CREATE TYPE ticket_status AS ENUM ('OPEN', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED');
CREATE TYPE ticket_severity AS ENUM ('CRITICAL', 'MEDIUM', 'LOW');
CREATE TYPE message_type AS ENUM ('PUBLIC_REPLY', 'INTERNAL_NOTE');

-- 1. USERS TABLE (Support Agents)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role VARCHAR(50) DEFAULT 'AGENT',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. TICKETS TABLE
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status ticket_status NOT NULL DEFAULT 'OPEN',
    severity ticket_severity NOT NULL DEFAULT 'MEDIUM',
    assigned_agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reopened_from_ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL, -- Handles reopen tracking
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE
);

-- 3. TICKET MESSAGES TABLE (Solves INC-0304: Privacy distinction)
CREATE TABLE ticket_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    type message_type NOT NULL, -- 'PUBLIC_REPLY' vs 'INTERNAL_NOTE'
    body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. TICKET AUDIT LOG TABLE (Solves INC-0318: Immutable audit trail)
CREATE TABLE ticket_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(100) NOT NULL, -- e.g., 'TICKET_TAKEN', 'INTERNAL_NOTE_ADDED', 'SEVERITY_CHANGED'
    metadata JSONB, -- Stores old/new values, e.g. {"old_status": "OPEN", "new_status": "RESOLVED"}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. BUSINESS HOLIDAYS TABLE (For SLA working-hours calculation[cite: 3])
CREATE TABLE business_holidays (
    id SERIAL PRIMARY KEY,
    holiday_date DATE UNIQUE NOT NULL,
    description VARCHAR(255)
);

-- INDEXES for fast querying on agent dashboard screen[cite: 3]
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_assigned_agent ON tickets(assigned_agent_id);
CREATE INDEX idx_messages_ticket_id ON ticket_messages(ticket_id);
CREATE INDEX idx_events_ticket_id ON ticket_events(ticket_id);