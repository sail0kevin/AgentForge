-- The actual key remains encrypted. This stores only its character count so
-- the edit form can render the same number of password dots without exposing
-- plaintext or ciphertext to the browser.
ALTER TABLE "ApiKey" ADD COLUMN "keyLength" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AgentCredential" ADD COLUMN "keyLength" INTEGER NOT NULL DEFAULT 0;
