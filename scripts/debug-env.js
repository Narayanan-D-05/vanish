import { AccountId, PrivateKey } from "@hashgraph/sdk";
import dotenv from "dotenv";
dotenv.config();

try {
  console.log("HEDERA_ACCOUNT_ID:", process.env.HEDERA_ACCOUNT_ID);
  const acc = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
  console.log("✅ AccountId OK:", acc.toString());

  console.log("HEDERA_PRIVATE_KEY length:", process.env.HEDERA_PRIVATE_KEY?.length);
  const pk = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);
  console.log("✅ PrivateKey OK");
} catch (e) {
  console.error("❌ Validation Failed:", e.message);
}
