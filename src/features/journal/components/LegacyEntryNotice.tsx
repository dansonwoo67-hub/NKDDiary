export function LegacyEntryNotice() {
  return (
    <section className="hand-card mx-auto max-w-3xl rounded-[2rem] p-8 text-center">
      <div className="text-4xl" aria-hidden="true">📜</div>
      <h1 className="mt-4 text-xl font-semibold text-[var(--ink)]">
        这条历史内容暂不支持在当前版本查看
      </h1>
      <p className="mt-3 text-sm text-[var(--muted-ink)]">
        数据已安全保留，没有被删除或修改。
      </p>
    </section>
  );
}
