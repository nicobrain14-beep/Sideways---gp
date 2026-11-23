# Modelos de Blender para Sideways GP

Pon aquí los coches hechos en Blender, exportados como **.glb**, dentro de `models/cars/`.
Luego añade una línea en `models.json` con el id del coche:

```json
{
  "cars": {
    "p911": "cars/porsche-911.glb",
    "lambo": { "file": "cars/huracan.glb", "turn": 180 }
  }
}
```

- `turn: 180` da la vuelta al coche si sale mirando hacia atrás.
- `scale` (por ejemplo `1.1`) lo hace un poco más largo o más corto. Sin `scale`, el juego lo deja del largo del coche original.
- Un coche sin modelo, o cuyo modelo no carga, sigue con el coche de siempre.

## Nombres que el juego entiende

| En Blender | Qué hace el juego |
|---|---|
| Material **Paint** (o Body) | Le pone el color de pintura y la skin de la tienda |
| Material **Accent** (o Detail, Stripe) | Le pone el color de detalle |
| Material **Glass** (o Window) | Cristal oscuro con reflejos |
| Material **Headlight** / **Taillight** | Luces que brillan; las de atrás se encienden al frenar |
| Objetos **Wheel_FL, Wheel_FR, Wheel_RL, Wheel_RR** | Las ruedas giran y las delanteras doblan |

Todo lo demás (interior, llantas, parrillas, logos...) se ve tal cual lo pintaste en Blender.

## Exportar desde Blender

File → Export → glTF 2.0: formato **glTF Binary (.glb)**, **+Y Up** marcado, **Apply Modifiers** marcado, compresión desactivada.

## Ids de los coches

ae86, evo, wrx, rx7, supra, r34, m4, gtr, stang, nsx, fordgt, p911, viper, f40, r8, lambo, mcl, vette, sf90, p918, senna, nevera, evija, chiron, amgone, huayra, revuel, jesko, valk, bolide, comet, titan, specter, sideways
