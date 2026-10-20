-- Categorías de herramientas más comunes en obra (mismas que prisma/seed.ts).
-- Solo agrega las que faltan: no borra, no renombra y no toca las que ya existen.
INSERT INTO "tool_categories" ("id", "name")
SELECT gen_random_uuid(), c.name
FROM (VALUES
  ('Taladro'),
  ('Rotomartillo'),
  ('Pulidora'),
  ('Demoledor'),
  ('Sierra circular'),
  ('Extensión eléctrica'),
  ('Nivel láser'),
  ('Compresor'),
  ('Soldadora'),
  ('Atornillador'),
  ('Llave de impacto'),
  ('Sierra caladora'),
  ('Sierra ingleteadora'),
  ('Cortadora de concreto'),
  ('Cortadora de cerámica'),
  ('Lijadora'),
  ('Pistola de calor'),
  ('Mezcladora de concreto'),
  ('Vibrador de concreto'),
  ('Bailarina (apisonador)'),
  ('Placa compactadora'),
  ('Generador eléctrico'),
  ('Bomba de agua'),
  ('Hidrolavadora'),
  ('Nivel óptico'),
  ('Estación total'),
  ('Andamio'),
  ('Escalera'),
  ('Carretilla'),
  ('Herramienta manual'),
  ('Otro')
) AS c(name)
ON CONFLICT ("name") DO NOTHING;
