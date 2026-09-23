import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { bitable } from '@lark-base-open/js-sdk';
import './style.css';

const COVER = '扩展信息/封面';
const SOURCE = '素材原始链接';
const ID = '业务素材ID';
const DESCRIPTION = '素材描述/正文';
const OPTIONAL = ['素材标题', '素材类型', '素材品类', '发布时间', ID, DESCRIPTION];
type Row = { id: string; fields: Record<string, unknown>; cover: string; source: string };

function text(value: unknown) { return Array.isArray(value) ? value.join('、') : value == null ? '' : String(value); }
function firstUrl(value: unknown) {
  const raw = text(value);
  const found = raw.match(/https?:\/\/[^\s,\])，]+/g);
  return found?.[0] ?? raw.trim();
}

async function loadRows(): Promise<Row[]> {
  const table = await bitable.base.getActiveTable();
  const fields = await table.getFieldList();
  const metadata = await Promise.all(fields.map(async (field: any) => ({ id: field.id, name: await field.getName() })));
  const names = new Set(metadata.map(field => field.name));
  const missing = [COVER, SOURCE].filter(name => !names.has(name));
  if (missing.length) throw new Error(`缺少必须字段：${missing.join('、')}`);
  const byName = new Map(metadata.map(field => [field.name, field.id]));
  const selection = await bitable.base.getSelection();
  const rows: Row[] = [];
  let pageToken: number | undefined;
  do {
    const page = await table.getRecordsByPage({ pageSize: 200, pageToken, viewId: selection.viewId ?? undefined, stringValue: true });
    for (const record of page.records as any[]) {
      const values: Record<string, unknown> = {};
      for (const name of [COVER, SOURCE, ...OPTIONAL]) if (names.has(name)) values[name] = record.fields[byName.get(name)!];
      rows.push({ id: String(record.recordId), fields: values, cover: firstUrl(values[COVER]), source: firstUrl(values[SOURCE]) });
    }
    pageToken = page.hasMore ? page.pageToken : undefined;
  } while (pageToken !== undefined);
  return rows;
}

function MediaCard({ row }: { row: Row }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  return <article className="card">
    <div className="card-head"><strong>{text(row.fields[ID]) || '无业务素材ID'}</strong><span>{text(row.fields['素材类型']) || '未填写类型'}</span><span>{text(row.fields['素材品类']) || '未填写品类'}</span></div>
    <div className="title">{text(row.fields['素材标题']) || '未填写标题'}</div>
    <div className="description">{text(row.fields[DESCRIPTION]) || '未填写素材描述/正文'}</div>
    <div className="media-grid">
      <section className="media-card"><h2>封面</h2>{row.cover && !coverFailed ? <img className="cover" loading="lazy" src={row.cover} referrerPolicy="no-referrer" onError={() => setCoverFailed(true)} /> : <div className="failed">封面加载失败</div>}{row.cover && <a href={row.cover} target="_blank" rel="noreferrer">打开封面原图</a>}</section>
      <section className="media-card"><h2>原始视频</h2>{row.source && !videoFailed ? <video className="video" controls preload="none" poster={row.cover || undefined} src={row.source} onError={() => setVideoFailed(true)} /> : <div className="failed">视频链接可能已过期或无法播放</div>}{row.source && <a href={row.source} target="_blank" rel="noreferrer">打开原始视频</a>}</section>
    </div>
    <div className="record-id">recordId：{row.id}</div>
  </article>;
}

function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const refresh = async () => { setError(''); setLoading(true); try { setRows(await loadRows()); setPage(1); } catch (err) { setError(String(err)); } finally { setLoading(false); } };
  useEffect(() => { refresh(); }, []);
  const filtered = useMemo(() => { const key = query.trim().toLowerCase(); if (!key) return rows; return rows.filter(row => `${text(row.fields[ID])}\n${text(row.fields[DESCRIPTION])}`.toLowerCase().includes(key)); }, [rows, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return <main>
    <header><div><h1>素材图片 / 视频审核</h1><p>封面预览 · 视频播放 · 搜索审核 · 只读模式</p></div><button onClick={refresh} disabled={loading}>{loading ? '读取中…' : '刷新'}</button></header>
    {error && <div className="error">{error}</div>}
    <div className="notice">只加载文字和链接；图片按当前页懒加载，视频点击播放时才请求，不会一次打开上千个视频。</div>
    <div className="toolbar"><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="搜索业务素材ID或素材描述/正文" /><label>每页 <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="6">6 条</option><option value="12">12 条</option><option value="24">24 条</option></select></label><span>共 {filtered.length} 条</span></div>
    {!loading && !error && !visible.length && <div className="empty">没有匹配的素材</div>}
    <section className="cards">{visible.map(row => <MediaCard key={row.id} row={row} />)}</section>
    {visible.length > 0 && <div className="pagination"><button disabled={currentPage <= 1} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {currentPage} / {totalPages} 页</span><button disabled={currentPage >= totalPages} onClick={() => setPage(value => value + 1)}>下一页</button></div>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
