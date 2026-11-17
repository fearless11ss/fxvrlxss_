export default function LogsLoading() {
  return (
    <div
      className="shell logsShell"
      aria-busy="true"
      aria-label="Загрузка журнала"
    >
      <aside className="sidebar logLoadingSidebar" />
      <main className="workspace logsWorkspace">
        <div className="logLoadingLine" />
        <div className="logLoadingTitle" />
        <div className="logLoadingMetrics" />
        <div className="logLoadingLedger" />
      </main>
    </div>
  );
}
