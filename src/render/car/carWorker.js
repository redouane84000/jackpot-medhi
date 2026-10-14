// Construit une carrosserie hors du fil principal (aucune dépendance au moteur de rendu).
import { buildCarBodyData } from './CarShape.js';

self.onmessage = e => {
  const { id, model, h } = e.data;
  const r = buildCarBodyData(model, { h });
  const bufs = [r.body.positions, r.body.normals, r.body.zones, r.body.indices, r.mirror.positions, r.mirror.normals, r.mirror.zones, r.mirror.indices].map(a => a.buffer);
  self.postMessage({ id, model, data: r }, bufs);
};
