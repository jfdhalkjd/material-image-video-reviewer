import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { bitable } from '@lark-base-open/js-sdk';
import './style.css';

const PHOTO = '朋友圈配图-AI';
const OPTIONAL = ['编号', '推广品类-AI', '追评文案-AI'];
type Row = { id: string; fields: Record<string, unknown>; original: string; pending?: string[]; undo?: { before: string; after: string } };

function text(v: unknown) { return Array.isArray(v) ? v.join('、') : v == null ? '' : String(v); }
function urls(v: string) { return v.split(/[\\n,，]+/).map(x => x.trim()).filter(Boolean); }

async function loadRows(): Promise<Row[]> {
  const table = await bitable.base.getActiveTable();
  const fields = await table.getFieldList();
  const fieldMeta = await Promise.all(fields.map(async (f: any) => ({ id: f.id, name: await f.getName() })));
  const names = new Set(fieldMeta.map((f: any) => f.name));
  if (!names.has(PHOTO)) throw new Error(`缺少必须字段：${PHOTO}`);
  const byId = new Map(fieldMeta.map((f: any) => [f.name, f.id]));
  const selection = await bitable.base.getSelection();
  const rows: Row[] = [];
  let pageToken: number | undefined = undefined;
  do {
    const page = await table.getRecordsByPage({ pageSize: 200, pageToken, viewId: selection.viewId ?? undefined, stringValue: true });
    for (const record of page.records as any[]) {
      const values: Record<string, unknown> = {};
      for (const name of [PHOTO, ...OPTIONAL]) if (names.has(name)) values[name] = record.fields[byId.get(name)!];
      rows.push({ id: String(record.recordId), fields: values, original: text(values[PHOTO]) });
    }
    pageToken = page.hasMore ? page.pageToken : undefined;
  } while (pageToken !== undefined);
  return rows;
}

function App() {
  const [rows, setRows] = useState<Row[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [lightbox, setLightbox] = useState<{row: Row; index: number} | null>(null);
  const refresh = async () => { setError(''); try { setRows(await loadRows()); } catch (e) { setError(String(e)); } };
  useEffect(() => { refresh(); }, []);
  const save = async (row: Row) => {
    const next = (row.pending ?? urls(row.original)).join(','); setBusy(true);
    try { const table = await bitable.base.getActiveTable(); const current = text(await table.getCellString((await table.getFieldByName(PHOTO)).id, row.id)); if (current !== row.original) throw new Error('这条记录的数据刚刚发生变化，请刷新后重新审核'); await table.setRecord(row.id, { fields: { [(await table.getFieldByName(PHOTO)).id]: next } }); setRows(rs => rs.map(r => r.id === row.id ? {...r, original: next, pending: undefined, undo: {before: row.original, after: next}} : r)); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  const undo = async (row: Row) => { if (!row.undo) return; const table = await bitable.base.getActiveTable(); const field = await table.getFieldByName(PHOTO); const current = text(await table.getCellString(field.id, row.id)); if (current !== row.undo.after) return setError('数据已发生变化，不能撤销，请刷新后重新审核'); await table.setRecord(row.id, { fields: {[field.id]: row.undo.before} }); setRows(rs => rs.map(r => r.id === row.id ? {...r, original: row.undo!.before, undo: undefined} : r)); };
  return <main><header><div><h1>朋友圈图片审核</h1><p>原图 URL 预览 · 只写回「{PHOTO}」</p></div><button onClick={refresh}>刷新</button></header>{error && <div className="error">{error}</div>}<div className="notice">只读预览已启用。删除图片后点击“保存本条”才会写回；每次写回前都会按 recordId 重新校验原值。</div><section>{rows.map(row => { const list = row.pending ?? urls(row.original); return <article key={row.id}><div className="meta"><span>{text(row.fields['编号']) || row.id}</span><b>{text(row.fields['推广品类-AI']) || '未填写品类'}</b></div><p className="copy">{text(row.fields['追评文案-AI'])}</p>{list.length ? <div className="photos">{list.map((url, i) => <div className="photo" key={url + i}><img src={url} onClick={() => setLightbox({row, index:i})} onError={e => { (e.currentTarget.parentElement as HTMLElement).innerHTML = `<div class="failed">图片加载失败<br/><a href="${url}" target="_blank">打开原图</a></div>`; }} /><button disabled={busy} onClick={() => setRows(rs => rs.map(r => r.id === row.id ? {...r, pending: list.filter((_, j) => j !== i)} : r))}>从下发中移除</button></div>)}</div> : <div className="empty">无图片</div>}{row.pending && <div className="actions"><button className="primary" disabled={busy} onClick={() => save(row)}>保存本条</button><button disabled={busy} onClick={() => setRows(rs => rs.map(r => r.id === row.id ? {...r, pending: undefined} : r))}>取消</button></div>}{row.undo && <button className="undo" disabled={busy} onClick={() => undo(row)}>撤销上次更新</button>}</article>})}</section>{lightbox && <div className="overlay" onClick={() => setLightbox(null)}><img src={(lightbox.row.pending ?? urls(lightbox.row.original))[lightbox.index]} /></div>}</main>;
}
createRoot(document.getElementById('root')!).render(<App />);
