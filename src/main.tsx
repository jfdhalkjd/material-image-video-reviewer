import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { bitable } from '@lark-base-open/js-sdk';
import './style.css';

const COVER = '扩展信息/封面';
const SOURCE = '素材原始链接';
const OPTIONAL = ['素材标题', '素材类型', '素材品类', '发布时间'];
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
    const page = await table.getRecordsByPage({ pageSize: 100, pageToken, viewId: selection.viewId ?? undefined, stringValue: true });
    for (const record of page.records as any[]) {
      const values: Record<string, unknown> = {};
      for (const name of [COVER, SOURCE, ...OPTIONAL]) if (names.has(name)) values[name] = record.fields[byName.get(name)!];
      rows.push({ id: String(record.recordId), fields: values, cover: firstUrl(values[COVER]), source: firstUrl(values[SOURCE]) });
    }
    pageToken = page.hasMore ? page.pageToken : undefined;
  } while (pageToken !== undefined);
  return rows;
}

function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const refresh = async () => { setError(''); setLoading(true); try { setRows(await loadRows()); setIndex(0); } catch (err) { setError(String(err)); } finally { setLoading(false); } };
  useEffect(() => { refresh(); }, []);
  const current = rows[index];
  return <main>
    <header><div><h1>素材图片 / 视频审核</h1><p>封面预览 · 视频播放 · 只读模式</p></div><button onClick={refresh} disabled={loading}>{loading ? '读取中…' : '刷新'}</button></header>
    {error && <div className="error">{error}</div>}
    <div className="notice">当前是只读审核，不会修改飞书表格。视频链接如果已过期，请点击“打开原始素材”。</div>
    {!error && !loading && !current && <div className="empty">当前视图没有可审核的素材</div>}
    {current && <><div className="progress">第 {index + 1} / {rows.length} 条</div><article>
      <div className="meta"><b>{text(current.fields['素材标题']) || '未填写标题'}</b><span>{text(current.fields['素材类型']) || '未填写类型'}</span><span>{text(current.fields['素材品类']) || '未填写品类'}</span></div>
      <div className="media-grid">
        <section className="media-card"><h2>封面</h2>{current.cover ? <img className="cover" src={current.cover} referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.classList.remove('hidden'); }} /> : null}<div className={`failed ${current.cover ? 'hidden' : ''}`}>封面加载失败</div>{current.cover && <a href={current.cover} target="_blank" rel="noreferrer">打开封面原图</a>}</section>
        <section className="media-card"><h2>原始视频</h2>{current.source ? <video className="video" controls preload="metadata" poster={current.cover || undefined} onError={event => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.classList.remove('hidden'); }} src={current.source} /> : null}<div className={`failed ${current.source ? 'hidden' : ''}`}>视频链接为空或无法播放</div>{current.source && <a href={current.source} target="_blank" rel="noreferrer">打开原始视频</a>}</section>
      </div>
      <div className="actions"><button disabled={index === 0} onClick={() => setIndex(value => value - 1)}>上一条</button><button disabled={index === rows.length - 1} onClick={() => setIndex(value => value + 1)}>下一条</button></div>
      <div className="record-id">recordId：{current.id}</div>
    </article></>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
