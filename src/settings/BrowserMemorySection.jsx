import "./browser-memory.css";
import { useCallback, useEffect, useState } from "react";
import { ArrowSquareOut, ClockCounterClockwise, DownloadSimple, MagnifyingGlass, Trash } from "@phosphor-icons/react";
import { SettingsGroup, SettingsRow, SettingsToggle } from "./SettingsPrimitives.jsx";

const count = value => Number(value || 0).toLocaleString("zh-CN");
const date = value => value ? new Date(value).toLocaleString("zh-CN", { year: "numeric", month: "short", day: "numeric" }) : "";

export function BrowserMemorySection({ actions }) {
  const api = window.beanBrowser;
  const [profile, setProfile] = useState(null);
  const [sources, setSources] = useState([]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [history, setHistory] = useState({ items: [], total: 0 });
  const [revision, setRevision] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const available = Boolean(api?.getBrowserMemoryProfile);

  const refreshSources = useCallback(async () => {
    const found = await api.listHistorySources();
    setSources(found);
    setSelected(found.map(source => source.id));
  }, [api]);

  useEffect(() => {
    if (!available) { setLoading(false); return; }
    let live = true;
    Promise.all([api.getBrowserMemoryProfile(), api.listHistorySources()]).then(([value, found]) => {
      if (!live) return;
      setProfile(value); setSources(found); setSelected(found.map(source => source.id));
    }).catch(error => { if (live) setError(error.message); }).finally(() => { if (live) setLoading(false); });
    const unsubscribe = api.onBrowserMemoryProgress?.(value => { if (live) setProgress(value.message); });
    return () => { live = false; unsubscribe?.(); };
  }, [api, available]);

  useEffect(() => {
    if (!available) return;
    let live = true;
    const timer = setTimeout(() => api.searchImportedHistory({ query, offset: page * 50 }).then(value => {
      if (live) setHistory(value);
    }).catch(error => { if (live) setError(error.message); }), 160);
    return () => { live = false; clearTimeout(timer); };
  }, [api, available, query, page, revision]);

  const mutate = async operation => {
    setBusy(true); setError("");
    try {
      const next = await operation();
      setProfile(next); setRevision(value => value + 1);
    } catch (error) { setError(error.message || "操作没有完成，请重试。"); }
    finally { setBusy(false); }
  };

  const importHistory = async () => {
    setBusy(true); setError(""); setMessage(""); setProgress("正在准备导入…");
    try {
      const result = await api.importBrowserHistory(selected);
      setProfile(result.profile); setRevision(value => value + 1); setPage(0);
      setMessage(result.addedVisits || result.addedPages
        ? `已新增 ${count(result.addedVisits)} 条访问记录、${count(result.addedPages)} 个来源网页。重复导入的记录已自动跳过。`
        : result.errors.length ? "本次未新增记录。" : "导入完成，没有新的记录。已有记录已更新。");
      setError(result.errors.join("\n"));
    } catch (error) { setError(error.message || "导入没有完成，请重试。"); }
    finally { setBusy(false); setProgress(""); }
  };

  return (
    <section className="brizo-settings-section brizo-memory-section" aria-labelledby="brizo-memory-heading" aria-busy={busy || loading}>
      <h2 id="brizo-memory-heading">浏览记忆</h2>
      <p className="brizo-memory-intro">把原来的浏览习惯带到 Brizo。Ask、Use 和地址栏会优先参考与你当前任务相关的常用网站。</p>
      <SettingsGroup title="导入浏览记录">
        <SettingsRow label="一键导入本机浏览器" description="支持 Chrome、Edge、Brave、Chromium、Vivaldi、Arc 和 Firefox 的本机配置。">
          <button className="brizo-memory-button is-primary" type="button" disabled={!available || busy || loading || !selected.length} onClick={importHistory}>
            <DownloadSimple size={15} />{busy && progress ? "正在导入…" : profile?.pages ? "再次导入" : "一键导入"}
          </button>
        </SettingsRow>
        <div className="brizo-memory-import-body">
          {sources.length > 0 && <div className="brizo-memory-sources" aria-label="选择浏览器配置">
            {sources.map(source => <label key={source.id}>
              <input type="checkbox" checked={selected.includes(source.id)} disabled={busy} onChange={event => setSelected(current => event.target.checked ? [...current, source.id] : current.filter(id => id !== source.id))} />
              <span>{source.name}</span>
            </label>)}
          </div>}
          <p>{!available ? "请在 Brizo 桌面版中导入，本页预览无法读取本机浏览器。" : loading ? "正在查找浏览器…" : !sources.length ? "未找到可读取的本机浏览器记录。请先在支持的浏览器中访问网页，再刷新列表。" : "导入源浏览器仍保留的全部 HTTP(S) 网页访问记录。记录与画像保存在本机；不导入密码或 Cookie，登录状态不会迁移。"}</p>
          {available && <button className="brizo-memory-text-button" type="button" disabled={busy || loading} onClick={() => refreshSources().catch(error => setError(error.message))}>刷新浏览器列表</button>}
          <p className="brizo-memory-notice" role="status" aria-live="polite">{progress || message}</p>
          {error && <p className="brizo-memory-error" role="alert">{error}</p>}
        </div>
      </SettingsGroup>

      <SettingsGroup title="我的浏览画像">
        <div className="brizo-memory-profile">
          <div className="brizo-memory-stats">
            <span><strong>{count(profile?.pages)}</strong><small>不同网页</small></span>
            <span><strong>{count(profile?.eventCount)}</strong><small>访问记录</small></span>
            <span><strong>{count(profile?.siteCount)}</strong><small>可参考网站</small></span>
          </div>
          <p>{profile?.summary || "导入后，这里会列出常用网站和浏览偏好。"}</p>
          {profile?.topics?.length > 0 && <div className="brizo-memory-topics">{profile.topics.map(topic => <span key={topic.id}>{topic.label}<small>{topic.sites} 个网站</small></span>)}</div>}
          <small>依据访问次数、近期使用和网页标题在本机整理，仅描述使用偏好。访问记录不能证明已登录；地址栏按网址和标题联想，不读取历史网页正文。</small>
        </div>
        {profile?.topSites?.map(site => <SettingsRow key={site.host} label={site.host} description={`${count(site.visits)} 次访问 · 最近 ${date(site.lastVisit)}`}>
          <button className="brizo-memory-text-button" disabled={busy} type="button" onClick={() => mutate(() => api.excludeMemorySite(site.host, true))}>不再参考</button>
        </SettingsRow>)}
        {profile?.excluded?.length > 0 && <div className="brizo-memory-excluded"><span>已排除的网站</span>{profile.excluded.map(host => <button key={host} type="button" disabled={busy} onClick={() => mutate(() => api.excludeMemorySite(host, false))}>{host} · 恢复</button>)}</div>}
      </SettingsGroup>

      <SettingsGroup title="使用方式">
        {[
          ["ask", "Ask 优先参考常用网站", "提交问题后，相关网站的域名会用于检索与回答。完整历史和画像不会上传。"],
          ["use", "Use 优先使用常用网站", "未指定网站时，从相关常用站点进入；你指定的网址始终优先。仍需在隔离网页中登录。"],
          ["address", "地址栏联想", "输入网址或内容关键词时，优先显示访问过的网页。"],
          ["learning", "继续整理 Brizo 浏览记录", "首次导入后，将普通网页的新访问纳入本地画像。无痕窗口和 Use 隔离网页不记录。"],
        ].map(([key, label, description]) => <SettingsRow key={key} label={label} description={description}>
          <SettingsToggle ariaLabel={label} checked={profile?.preferences?.[key] ?? true} disabled={!available || busy || loading} onChange={value => mutate(() => api.setBrowserMemoryPreferences({ [key]: value }))} />
        </SettingsRow>)}
      </SettingsGroup>

      <SettingsGroup title="已导入的网页">
        <div className="brizo-memory-history-toolbar">
          <label><MagnifyingGlass size={15} /><input aria-label="搜索已导入的网页" placeholder="搜索网页标题或网址" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
          <span>{count(history.total)} 个网页</span>
        </div>
        {history.items.length ? history.items.map(item => <div className="brizo-memory-history-row" key={item.url}>
          <ClockCounterClockwise size={17} aria-hidden="true" />
          <button className="brizo-memory-history-link" type="button" onClick={() => actions.openMemoryUrl?.(item.url)}><strong>{item.title || item.url}</strong><small>{item.url}</small><small>{item.sourceName || "Brizo"} · {date(item.updatedAt)} · {count(item.visits)} 次</small></button>
          <button className="brizo-memory-icon" type="button" aria-label={`打开 ${item.title}`} onClick={() => actions.openMemoryUrl?.(item.url)}><ArrowSquareOut size={15} /></button>
          <button className="brizo-memory-icon" type="button" disabled={busy} aria-label={`删除记录 ${item.title}`} onClick={() => { setPage(0); void mutate(() => api.removeImportedHistory(item.url)); }}><Trash size={15} /></button>
        </div>) : <p className="brizo-memory-empty">{query ? "没有匹配的网页，换个关键词试试。" : "导入后可在这里查找和打开原来的网页。"}</p>}
        {history.total > 50 && <div className="brizo-memory-pagination"><button type="button" disabled={!page} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page + 1} / {Math.ceil(history.total / 50)} 页</span><button type="button" disabled={(page + 1) * 50 >= history.total} onClick={() => setPage(value => value + 1)}>下一页</button></div>}
      </SettingsGroup>
      {Boolean(profile?.pages) && <div className="brizo-memory-clear">
        {confirmClear ? <><span>删除 Brizo 中的导入记录和画像？原浏览器的记录不受影响。</span><button className="brizo-memory-button" type="button" disabled={busy} onClick={() => { setPage(0); setConfirmClear(false); setMessage(""); void mutate(() => api.clearImportedHistory()); }}>删除记录和画像</button><button className="brizo-memory-text-button" type="button" onClick={() => setConfirmClear(false)}>取消</button></> : <button className="brizo-memory-text-button" disabled={busy} type="button" onClick={() => setConfirmClear(true)}>清除导入记录与画像</button>}
      </div>}
    </section>
  );
}
