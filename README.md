# Infinity Clicker

A responsive cosmic 2D clicker game built with HTML/CSS/JavaScript, Node.js, Express and PostgreSQL.

## Run locally

Requirements: Node.js 20+ and PostgreSQL.

1. Create a PostgreSQL database.
2. Set environment variables:
   - `DATABASE_URL`: PostgreSQL connection string
   - `JWT_SECRET`: a long random secret (never commit this)
   - `NODE_ENV=production` when deploying
3. Run `npm install`, then `npm start`.
4. Open `http://localhost:3000`.

The server creates the `players` table on startup.

## Deploy on Render

This repository includes `render.yaml` for a Node Web Service and PostgreSQL database. In Render, choose **New + → Blueprint**, connect this repository, and select the branch `feature/loot-system`. Review the services and database before applying. Render will configure `DATABASE_URL` and generate `JWT_SECRET`.

If the free database plan is unavailable for your account or region, choose an available PostgreSQL plan in Render. Do not paste secrets into source files or commit a `.env` file.

## Included in the first version

- Account registration and login with bcrypt password hashing and signed JWTs
- Server-side click rewards, upgrade costs, automatic income and rebirth validation
- PostgreSQL save data and global lifetime-energy ranking
- Responsive horizontal-friendly cosmic interface

## Notes

The browser token is stored locally on the device. Use HTTPS in production. The server is authoritative for currency and upgrade costs; as with any online game, further anti-abuse controls and automated tests should be added before treating the leaderboard as competitive or tamper-proof.