# Frontdesk Support Ticket System

A full-stack support ticket application built with React, Vite, Node.js, Express, and PostgreSQL. It supports ticket workflows, atomic ticket claiming, public replies vs. private notes, SLA tracking within **9:30–18:30 (Mon–Fri)** business hours, and immutable audit trails.

## Live Links & Repository

* **Frontend (Vercel):** `https://frontdesk-app-nu.vercel.app`
* **Backend API (Render):** `https://frontdesk-app-ohnm.onrender.com`
* **GitHub Repository:** `https://github.com/Bhavya3456/frontdesk-app`

## Tech Stack

* **Frontend:** React, Vite (`frontend/` directory)
* **Backend:** Node.js, Express (`backend/` directory)
* **Database:** PostgreSQL (`DATABASE_URL`)
* **Hosting:** Vercel (frontend) and Render (backend API and PostgreSQL)

## Key Features

* **Ticket Management:** View, filter, and update support tickets across workflow states.
* **Atomic Claim Logic:** Prevents duplicate claiming when multiple agents access tickets concurrently.
* **Public Replies & Private Notes:** Separates customer-facing replies from internal team notes.
* **Business-Hours SLA Logic:** Calculates SLA windows using **9:30–18:30, Monday–Friday** working hours.
* **Immutable Audit Trail:** Records key ticket events and state transitions for traceability.

## Project Structure

```text
frontdesk-app/
├── backend/
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   └── package.json
└── README.md
