import { assertWriteCapableE2eEnvironment } from "./e2e-environment-guard";
import { loadE2eEnv } from "./playwright-e2e-config";

export default function playwrightGlobalSetup() {
  loadE2eEnv();
  assertWriteCapableE2eEnvironment();
}
