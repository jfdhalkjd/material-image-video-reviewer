import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { bitable } from '@lark-base-open/js-sdk';
import './style.css';
import './modal.css';
import './edit.css';

const COVER = '扩展信息/封面';
// 原视频必须使用业务表里的“素材链接”，而不是旧版的“素材原始链接”。
const SOURCE = '素材链接';
const ID = '业务素材ID';
const TITLE = '视频标题/描述';
const EDITABLE = ['素材品类映射', '素材类型', '内容类型'];
const FIELD_ALIASES: Record<string, string[]> = { '素材品类': ['素材品类', '素材品类映射', '素材1素材品类映射'], '素材类型': ['素材类型'], '内容类型': ['内容类型'] };
const OPTIONAL = [TITLE, '素材标题', '素材品类', '素材类型', '内容类型', '发布时间', ID];
type Option = { name: string; color?: number };
type Row = { id: string; fields: Record<string, unknown>; fieldIds: Record<string, string>; options: Record<string, Option[]>; cover: string; source: string };

function text(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join('、');
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>;
    return text(item.text ?? item.name ?? item.title ?? item.value ?? item.link ?? item.url ?? item.href);
  }
  return String(value);
}

function firstUrl(value: unknown): string {
  const candidates: unknown[] = [];
  const visit = (item: unknown) => {
    if (item == null) return;
    if (Array.isArray(item)) return item.forEach(visit);
    if (typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      ['link', 'url', 'href', 'text', 'value'].forEach(key => visit(obj[key]));
      return;
    }
    candidates.push(String(item));
  };
  visit(value);
  for (const candidate of candidates) {
    const found = candidate.match(/https?:\/\/[^\s,\])，]+/g);
    if (found?.[0]) return found[0].replace(/[),.;，。；）》】]+$/, '');
  }
  return '';
}

async function loadRows(): Promise<Row[]> {
  const table = await bitable.base.getActiveTable();
  const fields = await table.getFieldList();
  const metadata = await Promise.all(fields.map(async (field: any) => ({ id: field.id, name: await field.getName() })));
  const actualNames: Record<string, string> = {};
  for (const canonical of EDITABLE) { actualNames[canonical] = canonical; for (const candidate of (FIELD_ALIASES[canonical] || [])) { if (metadata.some(field => field.name === candidate)) { actualNames[canonical] = candidate; break; } } }
  const metaList = await Promise.all(fields.map(async (field: any) => { try { return await field.getMeta(); } catch { return null; } }));
  const options: Record<string, Option[]> = {};
  for (const meta of (Array.isArray(metaList) ? metaList : []) as any[]) options[meta.name] = (meta.property?.options || []).map((option: any) => ({ name: option.name, color: option.color })).filter((option: Option) => option.name);
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
      const canonicalValues = { ...values } as Record<string, unknown>;
      const canonicalIds: Record<string, string> = Object.fromEntries(metadata.map(field => [field.name, field.id]));
      const canonicalOptions: Record<string, Option[]> = {};
      for (const canonical of EDITABLE) { const actual = actualNames[canonical]; canonicalValues[canonical] = values[actual]; canonicalIds[canonical] = canonicalIds[actual]; canonicalOptions[canonical] = options[actual] || []; }
      rows.push({ id: String(record.recordId), fields: canonicalValues, fieldIds: canonicalIds, options: canonicalOptions, cover: firstUrl(values[COVER]), source: firstUrl(values[SOURCE]) });
    }
    pageToken = page.hasMore ? page.pageToken : undefined;
  } while (pageToken !== undefined);
  return rows;
}

const OPTION_COLORS = ['#5b8ff9','#61dDAa','#65789b','#f6bd16','#7262fd','#78d3f8','#9661bc','#f6903d','#008685','#f08bb4'];
function colorFor(option?: Option) { return OPTION_COLORS[(option?.color || 0) % OPTION_COLORS.length]; }
function ChoiceField({ name, value, options, onChange }: { name: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  const safeOptions = Array.isArray(options) ? options : [];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  let current: Option | undefined; for (const option of safeOptions) { if (option.name === value) { current = option; break; } }
  const filtered = safeOptions.filter(option => option.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <label className="choice-field">{name}<div className="choice-control" onClick={() => setOpen(true)}>{current ? <span className="choice-pill" style={{ background: colorFor(current) }}>{current.name}</span> : <span className="choice-empty">未选择</span>}{value && <button type="button" className="choice-clear" onClick={event => { event.stopPropagation(); onChange(''); }}>×</button>}<span className="choice-arrow">▾</span></div>{open && <div className="choice-menu"><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索选项" />{filtered.map(option => <button type="button" key={option.name} onClick={() => { onChange(option.name); setOpen(false); setQuery(''); }}><span className="choice-dot" style={{ background: colorFor(option) }} />{option.name}</button>)}{!filtered.length && <span className="choice-none">没有匹配选项</span>}<button type="button" className="choice-close" onClick={() => setOpen(false)}>关闭</button></div>}</label>;
}

function MediaCard({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoError, setVideoError] = useState('');
  const [zoomed, setZoomed] = useState(false);
  const [videoShape, setVideoShape] = useState<'portrait' | 'landscape' | 'square'>('landscape');
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(EDITABLE.map(name => [name, text(row.fields[name])] )));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const original = Object.fromEntries(EDITABLE.map(name => [name, text(row.fields[name])] ));
  const dirty = EDITABLE.some(name => draft[name] !== original[name]);
  const save = async () => { setSaving(true); setSaveError(''); try { const table = await bitable.base.getActiveTable(); const values: Record<string, unknown> = {}; for (const name of EDITABLE) if (row.fieldIds[name]) values[row.fieldIds[name]] = draft[name] || null; await table.setRecord(row.id, values); onSaved(); } catch (error) { setSaveError(String(error)); } finally { setSaving(false); } };
  const handleVideoError = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const mediaError = event.currentTarget.error;
    setVideoError(mediaError ? `播放器错误码：${mediaError.code}` : '浏览器未返回具体错误');
    setVideoFailed(true);
  };
  return <article className="card">
    <div className="card-head"><strong>{text(row.fields[ID]) || '无业务素材ID'}</strong><span>{text(row.fields['素材类型']) || '未填写类型'}</span><span>{text(row.fields['素材品类']) || '未填写品类'}</span></div>
    <div className="title">{text(row.fields[TITLE]) || '未填写视频标题/描述'}</div>
    <div className="edit-fields">{EDITABLE.map(name => <ChoiceField key={name} name={name} value={draft[name] || ''} options={row.options[name] || []} onChange={value => setDraft(current => ({ ...current, [name]: value }))} />)}{dirty && <div className="edit-actions"><button type="button" onClick={() => setDraft(original)}>返回</button><button type="button" className="save" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存'}</button></div>}{saveError && <div className="save-error">保存失败：{saveError}</div>}</div>
    <div className="media-grid">
      <section className="media-card"><h2>封面</h2>{row.cover && !coverFailed ? <img className="cover" loading="lazy" src={row.cover} referrerPolicy="no-referrer" onError={() => setCoverFailed(true)} /> : <div className="failed">封面加载失败</div>}{row.cover && <a href={row.cover} target="_blank" rel="noreferrer">打开封面原图</a>}</section>
      <section className="media-card"><div className="media-title"><h2>素材视频</h2>{row.source && <button className="zoom-button" type="button" title="放大查看视频" aria-label="放大查看视频" onClick={() => setZoomed(value => !value)}>⌕</button>}</div>{row.source && !videoFailed ? <div className={`video-shell ${videoShape}${zoomed ? ' zoomed' : ''}`}>{zoomed && <button className="modal-close" type="button" aria-label="关闭放大预览" onClick={() => setZoomed(false)}>×</button>}<video className="video" controls preload="none" poster={row.cover || undefined} src={row.source} onLoadedMetadata={event => { const ratio = event.currentTarget.videoWidth / event.currentTarget.videoHeight; setVideoShape(ratio > 1.15 ? 'landscape' : ratio < .87 ? 'portrait' : 'square'); }} onError={handleVideoError} /></div> : <div className="failed">视频链接可能已过期或无法播放{videoError && <><br />{videoError}</>}{row.source && <><br /><small>{row.source}</small></>}</div>}{row.source && <a href={row.source} target="_blank" rel="noreferrer">打开素材视频</a>}</section>
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
  const filtered = useMemo(() => { const key = query.trim().toLowerCase(); if (!key) return rows; return rows.filter(row => `${text(row.fields[ID])}\n${text(row.fields[TITLE])}`.toLowerCase().includes(key)); }, [rows, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return <main>
    <header><div><h1>素材图片 / 视频审核</h1><p>封面预览 · 视频播放 · 搜索审核 · 字段编辑版</p></div><button onClick={refresh} disabled={loading}>{loading ? '读取中…' : '刷新'}</button></header>
    {error && <div className="error">{error}</div>}
    <div className="notice">只加载文字和链接；图片按当前页懒加载，视频点击播放时才请求，不会一次打开上千个视频。</div>
    <div className="toolbar"><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="搜索业务素材ID或视频标题/描述" /><label>每页 <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="10">10 条</option><option value="50">50 条</option><option value="100">100 条</option><option value="200">200 条</option></select></label><span>共 {filtered.length} 条</span></div>
    {!loading && !error && !visible.length && <div className="empty">没有匹配的素材</div>}
    <section className="cards">{visible.map(row => <MediaCard key={row.id} row={row} onSaved={refresh} />)}</section>
    {visible.length > 0 && <div className="pagination"><button disabled={currentPage <= 1} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {currentPage} / {totalPages} 页</span><button disabled={currentPage >= totalPages} onClick={() => setPage(value => value + 1)}>下一页</button></div>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
