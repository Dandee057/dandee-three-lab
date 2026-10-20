# Cabinet model

Put `cabinet.glb` in this folder and the arcade page uses it instead of the stand-in cabinet built in code.
If the file isn't here, or has no mesh called `Screen`, the stand-in is used.

## Exporting from Blender

1. **Scale and position:** model in metres (a real upright is about 1.8 m tall and 0.7 m wide). Put the origin
   on the floor at the centre of the cabinet, and model it facing Blender's **Front** view (−Y). The glTF exporter
   turns that into +Z, which is the direction the page expects.
2. **Name these objects** (the name in the Outliner):
   - `Screen`: the glass. UVs must fill 0–1 across it, upright, in a 7:9 portrait shape (e.g. 0.46 × 0.59 m).
     A slight bulge looks good. It gets the CRT material, so any material you give it is replaced.
   - `Joystick` (optional): the stick, with its origin at the pivot. It tilts left and right as the knight moves.
   - `ButtonA`, `ButtonB`, `Start` (optional): each button, or a parent empty with a child called `cap`. They dip when pressed.
3. **Export:** File → Export → glTF 2.0, format **glTF Binary (.glb)**, with *+Y Up* on (the default).
   Apply modifiers. Draco compression is not set up, so leave it off.
4. Keep textures at 1–2K and the file under about 10 MB so the page loads quickly.

Emissive materials (marquee, T-moulding, coin slots) glow through the bloom pass: give them an emission strength
above 1 in Blender.
