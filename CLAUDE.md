# Acquis BaaS Platform — Build Instructions

## Project
Acquis is a Banking-as-a-Service platform built on Hedera Hashgraph.
Patent pending — 56 claims filed USPTO.
FinCEN MSB registered — prepaid access provider.

## Permissions
You have permission to:
- Read and write all files in this project
- Install npm packages
- Run node, npm, and npx commands
- Create and modify configuration files
- Write and run tests
- Create environment variable template files (.env.example)

You do NOT have permission to:
- Commit or push to git without being asked
- Send any real API calls to Hedera mainnet (testnet only)
- Store real private keys or credentials in any file
- Deploy to any server without being asked

## Technology stack
- Runtime: Node.js 20+ with TypeScript
- Hedera SDK: @hashgraph/sdk
- HSuite SDK: @hsuite/smart-node-sdk
- API: Fastify
- Frontend: React 18 with Tailwind CSS
- Database: PostgreSQL via Prisma ORM
- Queue: Bull (Redis-backed job queue)
- Testing: Jest

## Environment
All Hedera operations use TESTNET only.
Operator account and key come from environment variables.
Never hardcode credentials.

## Build order
1. hedera-service — build this first, all other components depend on it
2. api-gateway — builds on top of hedera-service
3. merchant-dashboard — frontend for merchants
4. pos-terminal — POS interface
5. card-sdk — embeddable SDK last
6. funding-service — push payment / ACH funding rail

## Component 6: funding-service
Handles customer card funding via push payments (RfP) and ACH fallback.

Architecture rules:
- ALL bank interactions go through a BankAdapter interface. Never call a
  specific bank API directly from business logic.
- Implement MockBankAdapter first (simulates RfP lifecycle + webhooks).
  CrossRiverAdapter and others come later — design the interface so they
  drop in without changes to the state machine.
- RfP is an RTP-network capability today. FedNow RfP is future. ACH pull
  (with NACHA authorization record) is the fallback rail.
- A push payment can ONLY be originated by the customer's bank on the
  customer's instruction. We send Requests for Payment; we never originate
  the push. Standing approvals live at the customer's bank — we store the
  mandate reference and never send RfPs outside its limits.
- Every funding event records to HCS via hedera-service: invoice validation,
  consent state, request sent, credit matched. (Patent Claims 35–38 flow.)
- RfP lifecycle state machine: created → validated → sent → presented →
  approved | declined | expired → settled → matched → credited.
  All transitions idempotent. Unmatched credits go to a reconciliation queue.
