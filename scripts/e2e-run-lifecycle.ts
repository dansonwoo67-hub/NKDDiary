export class E2ERunLifecycle<TChild extends object> {
  private abortRequested = false;
  private server: TChild | null = null;
  private tests: TChild | null = null;
  private readonly stopped = new WeakSet<TChild>();

  constructor(private readonly stopChild: (child: TChild) => void) {}

  private stopOnce(child: TChild | null) {
    if (!child || this.stopped.has(child)) return;
    this.stopped.add(child);
    this.stopChild(child);
  }

  requestAbort() {
    this.abortRequested = true;
    this.stopChildren();
  }

  assertCanSpawn() {
    if (this.abortRequested) throw new Error("E2E run was aborted before spawning a child process.");
  }

  async checkpoint<T>(pending: Promise<T>) {
    const value = await pending;
    this.assertCanSpawn();
    return value;
  }

  assignServer(child: TChild) {
    this.server = child;
    if (this.abortRequested) this.stopOnce(child);
  }

  assignTests(child: TChild) {
    this.tests = child;
    if (this.abortRequested) this.stopOnce(child);
  }

  stopChildren() {
    this.stopOnce(this.tests);
    this.stopOnce(this.server);
  }
}
