import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "3tRX3KgrrKejQNoC1qjEzzTy7SwuF2pFYQtWvC134eBi"
);

export const NETWORK = "https://api.devnet.solana.com";

export const IDL = {
  version: "0.1.0",
  name: "sol_guard",
  address: "3tRX3KgrrKejQNoC1qjEzzTy7SwuF2pFYQtWvC134eBi",
  instructions: [
    {
      name: "initializeVault",
      accounts: [
        { name: "owner", isMut: true, isSigner: true },
        { name: "vault", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "guardians", type: { vec: "publicKey" } },
        { name: "guardianThreshold", type: "u8" },
        { name: "duressKey", type: "publicKey" },
        { name: "heartbeatInterval", type: "i64" },
      ],
    },
    {
      name: "deposit",
      accounts: [
        { name: "depositor", isMut: true, isSigner: true },
        { name: "vault", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
    {
      name: "heartbeat",
      accounts: [
        { name: "owner", isMut: false, isSigner: true },
        { name: "vault", isMut: true, isSigner: false },
      ],
      args: [],
    },
    {
      name: "initiateWithdrawal",
      accounts: [
        { name: "signer", isMut: false, isSigner: true },
        { name: "vault", isMut: true, isSigner: false },
      ],
      args: [
        { name: "amount", type: "u64" },
        { name: "destination", type: "publicKey" },
      ],
    },
    {
      name: "executeWithdrawal",
      accounts: [
        { name: "executor", isMut: false, isSigner: true },
        { name: "vault", isMut: true, isSigner: false },
        { name: "destination", isMut: true, isSigner: false },
      ],
      args: [],
    },
    {
      name: "cancelWithdrawal",
      accounts: [
        { name: "signer", isMut: false, isSigner: true },
        { name: "vault", isMut: true, isSigner: false },
      ],
      args: [],
    },
    {
      name: "emergencyFreeze",
      accounts: [
        { name: "signer", isMut: false, isSigner: true },
        { name: "vault", isMut: true, isSigner: false },
      ],
      args: [],
    },
    {
      name: "ownerUnfreeze",
      accounts: [
        { name: "owner", isMut: false, isSigner: true },
        { name: "vault", isMut: true, isSigner: false },
      ],
      args: [],
    },
    {
      name: "createGuardianProposal",
      accounts: [
        { name: "signer", isMut: false, isSigner: true },
        { name: "vault", isMut: true, isSigner: false },
      ],
      args: [
        { name: "action", type: { defined: "ProposalActionType" } },
        { name: "actionData", type: "publicKey" },
      ],
    },
    {
      name: "approveGuardianProposal",
      accounts: [
        { name: "signer", isMut: false, isSigner: true },
        { name: "vault", isMut: true, isSigner: false },
      ],
      args: [],
    },
    {
      name: "executeGuardianProposal",
      accounts: [
        { name: "executor", isMut: false, isSigner: true },
        { name: "vault", isMut: true, isSigner: false },
        { name: "destination", isMut: true, isSigner: false },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: "Vault",
      type: {
        kind: "struct",
        fields: [
          { name: "owner", type: "publicKey" },
          { name: "duressKey", type: "publicKey" },
          { name: "guardians", type: { vec: "publicKey" } },
          { name: "guardianThreshold", type: "u8" },
          { name: "lastHeartbeat", type: "i64" },
          { name: "heartbeatInterval", type: "i64" },
          { name: "status", type: { defined: "VaultStatus" } },
          { name: "pendingWithdrawal", type: { option: { defined: "PendingWithdrawal" } } },
          { name: "pendingProposal", type: { option: { defined: "GuardianProposalData" } } },
          { name: "bump", type: "u8" },
        ],
      },
    },
  ],
  types: [
    {
      name: "VaultStatus",
      type: { kind: "enum", variants: [{ name: "Active" }, { name: "Frozen" }] },
    },
    {
      name: "ProposalActionType",
      type: { kind: "enum", variants: [{ name: "RotateOwner" }, { name: "GuardianClaim" }] },
    },
    {
      name: "PendingWithdrawal",
      type: {
        kind: "struct",
        fields: [
          { name: "amount", type: "u64" },
          { name: "destination", type: "publicKey" },
          { name: "initiatedAt", type: "i64" },
          { name: "timelockDuration", type: "i64" },
        ],
      },
    },
    {
      name: "GuardianProposalData",
      type: {
        kind: "struct",
        fields: [
          { name: "action", type: { defined: "ProposalActionType" } },
          { name: "actionData", type: "publicKey" },
          { name: "approvals", type: { vec: "publicKey" } },
          { name: "createdAt", type: "i64" },
        ],
      },
    },
  ],
  errors: [],
} as const;
