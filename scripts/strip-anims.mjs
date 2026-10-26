// Entfernt alle Animationen außer den gewünschten aus einer GLB-Datei.
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';

const [input, output, keep] = process.argv.slice(2);
const pattern = new RegExp(`^(${keep})$`);
const io = new NodeIO();
const doc = await io.read(input);
for (const anim of doc.getRoot().listAnimations()) {
  if (!pattern.test(anim.getName())) anim.dispose();
}
await doc.transform(prune());
await io.write(output, doc);
