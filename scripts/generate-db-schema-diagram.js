const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(repoRoot, 'prisma', 'migrations');
const docsDir = path.join(repoRoot, 'docs');

const outputSvg = path.join(docsDir, 'database-schema.svg');
const outputMermaid = path.join(docsDir, 'database-schema.mmd');

const tableLayout = {
  User: { x: 40, y: 120, w: 330, accent: '#2563eb' },
  RefreshToken: { x: 40, y: 505, w: 330, accent: '#2563eb' },
  AuditLog: { x: 40, y: 740, w: 330, accent: '#7c3aed' },
  Warehouse: { x: 420, y: 120, w: 330, accent: '#059669' },
  UserWarehouse: { x: 420, y: 370, w: 330, accent: '#059669' },
  Location: { x: 420, y: 610, w: 330, accent: '#059669' },
  Product: { x: 800, y: 120, w: 330, accent: '#0f766e' },
  Inventory: { x: 800, y: 455, w: 330, accent: '#d97706' },
  InventoryLot: { x: 800, y: 755, w: 330, accent: '#d97706' },
  PriceHistory: { x: 1180, y: 120, w: 330, accent: '#c2410c' },
  StockMovement: { x: 1180, y: 455, w: 330, accent: '#4f46e5' },
  DecayAudit: { x: 1180, y: 845, w: 330, accent: '#be123c' },
};

const typeAliases = {
  'TIMESTAMP(3)': 'TIMESTAMP',
  'DECIMAL(12,2)': 'DECIMAL',
};

function main() {
  const sql = readMigrations();
  const schema = parseSql(sql);
  enrichColumns(schema);

  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(outputMermaid, buildMermaid(schema));
  fs.writeFileSync(outputSvg, buildSvg(schema));

  console.log(`Wrote ${path.relative(repoRoot, outputMermaid)}`);
  console.log(`Wrote ${path.relative(repoRoot, outputSvg)}`);
  console.log(`Tables: ${schema.tables.length}`);
  console.log(`Foreign keys: ${schema.foreignKeys.length}`);
}

function readMigrations() {
  const migrationFiles = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(migrationsDir, entry.name, 'migration.sql'))
    .filter((file) => fs.existsSync(file))
    .sort();

  return migrationFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n\n');
}

function parseSql(sql) {
  const tablesByName = new Map();
  const createTableRegex = /CREATE TABLE\s+"([^"]+)"\s+\(([\s\S]*?)\n\);/g;
  let createTableMatch;

  while ((createTableMatch = createTableRegex.exec(sql)) !== null) {
    const [, tableName, body] = createTableMatch;
    const table = {
      name: tableName,
      columns: [],
      primaryKeys: [],
      uniqueColumns: new Set(),
      uniqueGroups: [],
      indexes: [],
    };

    body
      .split('\n')
      .map((line) => line.trim().replace(/,$/, ''))
      .filter(Boolean)
      .forEach((line) => {
        const pkMatch = line.match(/PRIMARY KEY\s+\(([^)]+)\)/);
        if (pkMatch) {
          table.primaryKeys = parseColumnList(pkMatch[1]);
          return;
        }

        const columnMatch = line.match(/^"([^"]+)"\s+(.+)$/);
        if (!columnMatch) {
          return;
        }

        const [, name, definition] = columnMatch;
        table.columns.push({
          name,
          type: normalizeType(readType(definition)),
          nullable: !/\bNOT NULL\b/.test(definition),
          defaultValue: readDefault(definition),
          isPrimary: false,
          isUnique: false,
          isForeignKey: false,
          references: null,
        });
      });

    tablesByName.set(tableName, table);
  }

  const uniqueRegex = /CREATE UNIQUE INDEX\s+"[^"]+"\s+ON\s+"([^"]+)"\(([^)]+)\);/g;
  let uniqueMatch;
  while ((uniqueMatch = uniqueRegex.exec(sql)) !== null) {
    const [, tableName, columnsText] = uniqueMatch;
    const table = tablesByName.get(tableName);
    if (!table) continue;

    const columns = parseColumnList(columnsText);
    table.uniqueGroups.push(columns);
    if (columns.length === 1) {
      table.uniqueColumns.add(columns[0]);
    }
  }

  const indexRegex = /CREATE INDEX\s+"[^"]+"\s+ON\s+"([^"]+)"\(([^)]+)\);/g;
  let indexMatch;
  while ((indexMatch = indexRegex.exec(sql)) !== null) {
    const [, tableName, columnsText] = indexMatch;
    const table = tablesByName.get(tableName);
    if (!table) continue;
    table.indexes.push(parseColumnList(columnsText));
  }

  const foreignKeys = [];
  const fkRegex =
    /ALTER TABLE\s+"([^"]+)"\s+ADD CONSTRAINT\s+"([^"]+)"\s+FOREIGN KEY\s+\("([^"]+)"\)\s+REFERENCES\s+"([^"]+)"\("([^"]+)"\)\s+ON DELETE\s+([A-Z ]+?)\s+ON UPDATE\s+([A-Z ]+?);/g;
  let fkMatch;
  while ((fkMatch = fkRegex.exec(sql)) !== null) {
    const [, tableName, constraint, column, referencedTable, referencedColumn, onDelete, onUpdate] = fkMatch;
    foreignKeys.push({
      id: foreignKeys.length + 1,
      tableName,
      constraint,
      column,
      referencedTable,
      referencedColumn,
      onDelete: onDelete.trim(),
      onUpdate: onUpdate.trim(),
    });
  }

  return {
    tables: Array.from(tablesByName.values()),
    tablesByName,
    foreignKeys,
  };
}

function enrichColumns(schema) {
  const fkByColumn = new Map(
    schema.foreignKeys.map((fk) => [`${fk.tableName}.${fk.column}`, fk])
  );

  schema.tables.forEach((table) => {
    table.columns.forEach((column) => {
      column.isPrimary = table.primaryKeys.includes(column.name);
      column.isUnique = table.uniqueColumns.has(column.name);
      const fk = fkByColumn.get(`${table.name}.${column.name}`);
      if (fk) {
        column.isForeignKey = true;
        column.references = `${fk.referencedTable}.${fk.referencedColumn}`;
      }
    });
  });
}

function parseColumnList(text) {
  return text
    .split(',')
    .map((value) => value.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

function readType(definition) {
  const typeMatch = definition.match(/^("[^"]+"|[A-Z]+(?:\([^)]+\))?)/);
  return typeMatch ? typeMatch[1].replace(/"/g, '') : definition.split(/\s+/)[0];
}

function normalizeType(type) {
  return typeAliases[type] || type;
}

function readDefault(definition) {
  const defaultMatch = definition.match(/\bDEFAULT\s+([^,]+?)(?:\s+NOT NULL|\s*$)/);
  return defaultMatch ? defaultMatch[1].trim() : null;
}

function buildMermaid(schema) {
  const lines = ['erDiagram'];

  schema.tables.forEach((table) => {
    lines.push(`  ${table.name} {`);
    table.columns.forEach((column) => {
      const tags = [];
      if (column.isPrimary) tags.push('PK');
      if (column.isForeignKey) tags.push('FK');
      if (column.isUnique && !column.isPrimary) tags.push('UK');
      lines.push(`    ${mermaidType(column.type)} ${column.name} ${tags.join(',')}`.trimEnd());
    });
    lines.push('  }');
  });

  lines.push('');
  schema.foreignKeys.forEach((fk) => {
    const child = schema.tablesByName.get(fk.tableName);
    const column = child.columns.find((item) => item.name === fk.column);
    const parentCardinality = column && column.nullable ? 'o|' : '||';
    lines.push(
      `  ${fk.referencedTable} ${parentCardinality}--o{ ${fk.tableName} : "${fk.column}"`
    );
  });

  return `${lines.join('\n')}\n`;
}

function mermaidType(type) {
  return type.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function buildSvg(schema) {
  return buildConnectionPanelSvg(schema);
}

function buildConnectionPanelSvg(schema) {
  const width = 1600;
  const height = 1400;
  const fkByKey = new Map(
    schema.foreignKeys.map((fk) => [`${fk.tableName}.${fk.column}->${fk.referencedTable}`, fk])
  );

  const panels = [
    {
      title: 'Identity, Audit, And Warehouse Access',
      x: 40,
      y: 100,
      w: 730,
      h: 330,
      nodes: [
        panelNode('User', 60, 56),
        panelNode('RefreshToken', 60, 216),
        panelNode('AuditLog', 270, 216),
        panelNode('UserWarehouse', 270, 126),
        panelNode('Warehouse', 500, 56),
        panelNode('Location', 500, 216),
      ],
      edges: [
        panelEdge('RefreshToken', 'User', 'user_id'),
        panelEdge('AuditLog', 'User', 'user_id'),
        panelEdge('UserWarehouse', 'User', 'user_id'),
        panelEdge('UserWarehouse', 'Warehouse', 'warehouse_id'),
        panelEdge('Location', 'Warehouse', 'warehouse_id'),
      ],
    },
    {
      title: 'Inventory Chain',
      x: 830,
      y: 100,
      w: 730,
      h: 330,
      nodes: [
        panelNode('Product', 70, 56),
        panelNode('Location', 480, 56),
        panelNode('Inventory', 275, 152),
        panelNode('InventoryLot', 275, 246),
      ],
      edges: [
        panelEdge('Inventory', 'Product', 'product_id'),
        panelEdge('Inventory', 'Location', 'location_id'),
        panelEdge('InventoryLot', 'Inventory', 'inventory_id'),
        panelEdge('InventoryLot', 'InventoryLot', 'parent_lot_id'),
      ],
    },
    {
      title: 'Stock Movement',
      x: 40,
      y: 465,
      w: 730,
      h: 295,
      nodes: [
        panelNode('User', 60, 54),
        panelNode('Product', 275, 54),
        panelNode('Location', 500, 54),
        panelNode('StockMovement', 275, 188),
      ],
      edges: [
        panelEdge('StockMovement', 'Product', 'product_id'),
        panelEdge('StockMovement', 'User', 'user_id'),
        panelEdge('StockMovement', 'Location', 'from_location_id'),
        panelEdge('StockMovement', 'Location', 'to_location_id'),
      ],
    },
    {
      title: 'Price History',
      x: 830,
      y: 465,
      w: 730,
      h: 295,
      nodes: [
        panelNode('User', 60, 54),
        panelNode('Product', 275, 54),
        panelNode('Location', 500, 54),
        panelNode('PriceHistory', 275, 188),
      ],
      edges: [
        panelEdge('PriceHistory', 'Product', 'product_id'),
        panelEdge('PriceHistory', 'Location', 'location_id'),
        panelEdge('PriceHistory', 'User', 'user_id'),
      ],
    },
    {
      title: 'Dead Stock Decay Audit',
      x: 40,
      y: 795,
      w: 730,
      h: 315,
      nodes: [
        panelNode('InventoryLot', 60, 54),
        panelNode('Product', 275, 54),
        panelNode('Location', 500, 54),
        panelNode('DecayAudit', 275, 194),
      ],
      edges: [
        panelEdge('DecayAudit', 'InventoryLot', 'inventory_lot_id'),
        panelEdge('DecayAudit', 'Product', 'product_id'),
        panelEdge('DecayAudit', 'Location', 'location_id'),
      ],
    },
  ].map((panel) => hydratePanel(panel, fkByKey));

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1400" viewBox="0 0 1600 1400" role="img" aria-labelledby="title desc">',
    '<title id="title">LeanStock database connection map</title>',
    '<desc id="desc">Clear entity relationship map generated from Prisma migration SQL. Foreign keys are grouped by workflow and arrows point from child tables to referenced parent tables.</desc>',
    '<defs>',
    '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#334155"/></marker>',
    '<filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.11"/></filter>',
    '<style>',
    '.bg{fill:#f7f9fc}.title{font:700 30px Arial,sans-serif;fill:#0f172a}.subtitle{font:14px Arial,sans-serif;fill:#475569}.panel{fill:#ffffff;stroke:#cbd5e1;stroke-width:1.2}.panel-title{font:700 15px Arial,sans-serif;fill:#0f172a}.node{fill:#ffffff;stroke:#cbd5e1;stroke-width:1.2;filter:url(#softShadow)}.node-title{font:700 14px Arial,sans-serif;fill:#ffffff}.node-meta{font:11px Consolas,Monaco,monospace;fill:#475569}.edge{fill:none;stroke:#334155;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;marker-end:url(#arrow)}.edge-nullable{stroke-dasharray:7 5}.label-box{fill:#ffffff;stroke:#cbd5e1;stroke-width:1}.edge-label{font:700 11px Consolas,Monaco,monospace;fill:#0f172a}.badge-text{font:700 10px Arial,sans-serif;fill:#ffffff}.fk-index{font:11px Consolas,Monaco,monospace;fill:#334155}.legend{font:12px Arial,sans-serif;fill:#334155}',
    '</style>',
    '</defs>',
    `<rect class="bg" x="0" y="0" width="${width}" height="${height}"/>`,
    '<text class="title" x="40" y="46">LeanStock Database Connections</text>',
    `<text class="subtitle" x="40" y="73">Child table FK -> referenced table PK. Arrows point to the parent table. Dashed lines are nullable foreign keys. Tables: ${schema.tables.length}. Foreign keys: ${schema.foreignKeys.length}.</text>`,
    buildConnectionLegend(1160, 34),
    ...panels.map((panel) => drawConnectionPanel(panel)),
    drawFkIndexPanel(schema.foreignKeys, 40, 1140, 1520, 220),
    '</svg>',
  ].join('\n');
}

function panelNode(name, x, y) {
  return { name, x, y, w: 170, h: 62 };
}

function panelEdge(child, parent, column) {
  return { child, parent, column };
}

function hydratePanel(panel, fkByKey) {
  const nodeByName = new Map(panel.nodes.map((node) => [node.name, node]));
  panel.nodes.forEach((node) => {
    node.cx = panel.x + node.x + node.w / 2;
    node.cy = panel.y + node.y + node.h / 2;
    node.absX = panel.x + node.x;
    node.absY = panel.y + node.y;
  });

  panel.edges = panel.edges.map((edge) => {
    const fk = fkByKey.get(`${edge.child}.${edge.column}->${edge.parent}`);
    if (!fk) {
      throw new Error(`Missing FK for ${edge.child}.${edge.column} -> ${edge.parent}`);
    }
    return {
      ...edge,
      fk,
      childNode: nodeByName.get(edge.child),
      parentNode: nodeByName.get(edge.parent),
    };
  });

  const siblingGroups = new Map();
  panel.edges.forEach((edge) => {
    const key = `${edge.child}->${edge.parent}`;
    if (!siblingGroups.has(key)) siblingGroups.set(key, []);
    siblingGroups.get(key).push(edge);
  });
  panel.edges.forEach((edge) => {
    const siblings = siblingGroups.get(`${edge.child}->${edge.parent}`);
    edge.siblingIndex = siblings.indexOf(edge);
    edge.siblingCount = siblings.length;
  });

  return panel;
}

function buildConnectionLegend(x, y) {
  return [
    `<g transform="translate(${x} ${y})">`,
    '<rect x="0" y="-18" width="390" height="58" rx="8" fill="#ffffff" stroke="#cbd5e1"/>',
    '<line x1="18" y1="6" x2="86" y2="6" class="edge"/>',
    '<text class="legend" x="100" y="10">required FK</text>',
    '<line x1="200" y1="6" x2="268" y2="6" class="edge edge-nullable"/>',
    '<text class="legend" x="282" y="10">nullable FK</text>',
    '<text class="legend" x="18" y="32">Colored header identifies each table node</text>',
    '</g>',
  ].join('\n');
}

function drawConnectionPanel(panel) {
  return [
    `<g id="panel-${escapeAttr(panel.title)}">`,
    `<rect class="panel" x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}" rx="10"/>`,
    `<text class="panel-title" x="${panel.x + 18}" y="${panel.y + 28}">${escapeXml(panel.title)}</text>`,
    ...panel.edges.map((edge) => drawPanelEdge(edge)),
    ...panel.edges.map((edge) => drawPanelEdgeLabel(edge)),
    ...panel.nodes.map((node) => drawPanelNode(node)),
    '</g>',
  ].join('\n');
}

function drawPanelNode(node) {
  const color = tableColor(node.name);
  return [
    `<g id="node-${escapeAttr(node.name)}-${Math.round(node.absX)}-${Math.round(node.absY)}">`,
    `<rect class="node" x="${node.absX}" y="${node.absY}" width="${node.w}" height="${node.h}" rx="8"/>`,
    `<rect x="${node.absX}" y="${node.absY}" width="${node.w}" height="30" rx="8" fill="${color}"/>`,
    `<path d="M ${node.absX} ${node.absY + 22} H ${node.absX + node.w} V ${node.absY + 30} H ${node.absX} Z" fill="${color}"/>`,
    `<text class="node-title" x="${node.absX + 12}" y="${node.absY + 20}">${escapeXml(node.name)}</text>`,
    `<text class="node-meta" x="${node.absX + 12}" y="${node.absY + 48}">PK: id</text>`,
    '</g>',
  ].join('\n');
}

function drawPanelEdge(edge) {
  const route = routeEdge(edge);
  edge.route = route;
  const nullable = edgeNullable(edge) ? ' edge-nullable' : '';
  return `<path class="edge${nullable}" d="${route.d}"/>`;
}

function drawPanelEdgeLabel(edge) {
  const route = edge.route || routeEdge(edge);
  const label = `${edge.fk.id}. ${edge.column}`;
  const labelWidth = Math.max(70, label.length * 7 + 14);
  const labelHeight = 20;
  const x = route.label.x - labelWidth / 2;
  const y = route.label.y - labelHeight / 2;

  return [
    `<rect class="label-box" x="${round(x)}" y="${round(y)}" width="${round(labelWidth)}" height="${labelHeight}" rx="10"/>`,
    `<text class="edge-label" x="${round(route.label.x)}" y="${round(route.label.y + 4)}" text-anchor="middle">${escapeXml(label)}</text>`,
  ].join('\n');
}

function routeEdge(edge) {
  if (edge.child === edge.parent) {
    return routeSelfEdge(edge.childNode);
  }

  const from = anchorToward(edge.childNode, edge.parentNode);
  const to = anchorToward(edge.parentNode, edge.childNode);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const offset = (edge.siblingIndex - (edge.siblingCount - 1) / 2) * 28;
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  if (horizontal) {
    const midX = from.x + dx / 2;
    const c1 = { x: midX, y: from.y + offset };
    const c2 = { x: midX, y: to.y + offset };
    return {
      d: `M ${round(from.x)} ${round(from.y + offset)} C ${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ${round(to.x)} ${round(to.y + offset)}`,
      label: { x: midX, y: from.y + dy / 2 + offset },
    };
  }

  const midY = from.y + dy / 2;
  const c1 = { x: from.x + offset, y: midY };
  const c2 = { x: to.x + offset, y: midY };
  return {
    d: `M ${round(from.x + offset)} ${round(from.y)} C ${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ${round(to.x + offset)} ${round(to.y)}`,
    label: { x: from.x + dx / 2 + offset, y: midY },
  };
}

function routeSelfEdge(node) {
  const start = { x: node.absX + node.w, y: node.absY + 22 };
  const end = { x: node.absX + node.w, y: node.absY + 48 };
  return {
    d: `M ${start.x} ${start.y} C ${start.x + 70} ${start.y}, ${end.x + 70} ${end.y}, ${end.x} ${end.y}`,
    label: { x: start.x + 78, y: start.y + 13 },
  };
}

function anchorToward(source, target) {
  const dx = target.cx - source.cx;
  const dy = target.cy - source.cy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: source.absX + (dx >= 0 ? source.w : 0),
      y: source.cy,
    };
  }

  return {
    x: source.cx,
    y: source.absY + (dy >= 0 ? source.h : 0),
  };
}

function edgeNullable(edge) {
  return edge.fk && edge.fk.tableName && edge.fk.column
    ? edge.fk.column.endsWith('_id') && nullableFkColumns.has(`${edge.fk.tableName}.${edge.fk.column}`)
    : false;
}

const nullableFkColumns = new Set([
  'InventoryLot.parent_lot_id',
  'StockMovement.from_location_id',
  'StockMovement.to_location_id',
  'PriceHistory.location_id',
  'DecayAudit.location_id',
]);

function tableColor(tableName) {
  const colors = {
    User: '#2563eb',
    RefreshToken: '#1d4ed8',
    AuditLog: '#7c3aed',
    Warehouse: '#059669',
    UserWarehouse: '#0d9488',
    Location: '#16a34a',
    Product: '#0f766e',
    Inventory: '#d97706',
    InventoryLot: '#ea580c',
    StockMovement: '#4f46e5',
    PriceHistory: '#c2410c',
    DecayAudit: '#be123c',
  };
  return colors[tableName] || '#475569';
}

function drawFkIndexPanel(foreignKeys, x, y, w, h) {
  const rowsPerColumn = 10;
  const columnWidth = w / 2;
  const rowStep = Math.min(23, (h - 68) / (rowsPerColumn - 1));
  const pieces = [
    `<g id="fk-index">`,
    `<rect class="panel" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>`,
    `<text class="panel-title" x="${x + 18}" y="${y + 28}">Full Foreign Key Index</text>`,
  ];

  foreignKeys.forEach((fk, index) => {
    const col = index < rowsPerColumn ? 0 : 1;
    const row = index % rowsPerColumn;
    const textX = x + 18 + col * columnWidth;
    const textY = y + 58 + row * rowStep;
    const optional = nullableFkColumns.has(`${fk.tableName}.${fk.column}`) ? ' optional' : '';
    const text = `${fk.id}. ${fk.tableName}.${fk.column} -> ${fk.referencedTable}.${fk.referencedColumn}${optional}`;
    pieces.push(`<text class="fk-index" x="${textX}" y="${round(textY)}">${escapeXml(fit(text, 98))}</text>`);
  });

  pieces.push('</g>');
  return pieces.join('\n');
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function buildDetailedTableSvg(schema) {
  const tables = schema.tables.map((table) => ({
    ...table,
    ...(tableLayout[table.name] || fallbackLayout(table.name)),
  }));
  const tableByName = new Map(tables.map((table) => [table.name, table]));

  tables.forEach((table) => {
    table.h = 44 + table.columns.length * 22 + 14;
    table.cx = table.x + table.w / 2;
    table.cy = table.y + table.h / 2;
  });

  const edges = schema.foreignKeys.map((fk) => ({
    ...fk,
    child: tableByName.get(fk.tableName),
    parent: tableByName.get(fk.referencedTable),
    columnMeta: schema.tablesByName
      .get(fk.tableName)
      .columns.find((column) => column.name === fk.column),
  }));

  const edgeGroups = groupEdges(edges);
  edges.forEach((edge) => {
    const key = `${edge.tableName}->${edge.referencedTable}`;
    edge.groupIndex = edgeGroups.get(key).indexOf(edge);
    edge.groupSize = edgeGroups.get(key).length;
  });

  const width = 1550;
  const height = 1460;
  const relationshipPanelY = 1140;

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1550" height="1460" viewBox="0 0 1550 1460" role="img" aria-labelledby="title desc">',
    '<title id="title">LeanStock database schema diagram</title>',
    '<desc id="desc">Entity relationship diagram generated from Prisma migration SQL. It includes all tables, columns, primary keys, unique keys, and foreign key connections.</desc>',
    '<defs>',
    '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#475569"/></marker>',
    '<filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/></filter>',
    '<style>',
    '.bg{fill:#f6f8fb}.title{font:700 28px Arial,sans-serif;fill:#0f172a}.subtitle{font:14px Arial,sans-serif;fill:#475569}.legend{font:12px Arial,sans-serif;fill:#334155}.card{fill:#ffffff;stroke:#cbd5e1;stroke-width:1.2;filter:url(#softShadow)}.header-text{font:700 15px Arial,sans-serif;fill:#ffffff}.col-name{font:12px Consolas,Monaco,monospace;fill:#0f172a}.col-type{font:11px Consolas,Monaco,monospace;fill:#475569}.row-alt{fill:#f8fafc}.row-fk{fill:#fff7ed}.edge{fill:none;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round;opacity:.86}.edge-optional{stroke-dasharray:7 5}.badge-text{font:700 10px Arial,sans-serif;fill:#ffffff}.panel-title{font:700 14px Arial,sans-serif;fill:#0f172a}.rel{font:12px Consolas,Monaco,monospace;fill:#334155}.tag-text{font:700 10px Arial,sans-serif;fill:#334155}',
    '</style>',
    '</defs>',
    `<rect class="bg" x="0" y="0" width="${width}" height="${height}"/>`,
    '<text class="title" x="40" y="48">LeanStock Database Schema</text>',
    '<text class="subtitle" x="40" y="74">Generated from Prisma migration SQL. Dashed connections are nullable foreign keys; arrowheads point to referenced primary keys.</text>',
    buildLegend(),
    ...edges.map((edge) => drawEdge(edge)),
    ...edges.map((edge) => drawBadge(edge)),
    ...tables.map((table) => drawTable(table)),
    drawRelationshipPanel(edges, relationshipPanelY),
    '</svg>',
  ].join('\n');
}

function fallbackLayout(name) {
  const index = name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return {
    x: 40 + (index % 4) * 380,
    y: 1180 + Math.floor(index / 4) * 260,
    w: 330,
    accent: '#64748b',
  };
}

function buildLegend() {
  return [
    '<g transform="translate(1110 36)">',
    '<rect x="0" y="-22" width="400" height="56" rx="8" fill="#ffffff" stroke="#cbd5e1"/>',
    '<text class="legend" x="16" y="0">PK = primary key</text>',
    '<text class="legend" x="150" y="0">FK = foreign key</text>',
    '<text class="legend" x="292" y="0">UQ = unique</text>',
    '<line x1="16" y1="22" x2="86" y2="22" stroke="#475569" stroke-width="2.1" marker-end="url(#arrow)"/>',
    '<text class="legend" x="98" y="26">required</text>',
    '<line x1="202" y1="22" x2="272" y2="22" stroke="#475569" stroke-width="2.1" stroke-dasharray="7 5" marker-end="url(#arrow)"/>',
    '<text class="legend" x="284" y="26">nullable</text>',
    '</g>',
  ].join('\n');
}

function drawTable(table) {
  const pieces = [];
  pieces.push(`<g id="table-${escapeAttr(table.name)}">`);
  pieces.push(
    `<rect class="card" x="${table.x}" y="${table.y}" width="${table.w}" height="${table.h}" rx="8"/>`
  );
  pieces.push(
    `<rect x="${table.x}" y="${table.y}" width="${table.w}" height="44" rx="8" fill="${table.accent}"/>`
  );
  pieces.push(
    `<path d="M ${table.x} ${table.y + 36} H ${table.x + table.w} V ${table.y + 44} H ${table.x} Z" fill="${table.accent}"/>`
  );
  pieces.push(
    `<text class="header-text" x="${table.x + 16}" y="${table.y + 28}">${escapeXml(table.name)}</text>`
  );

  table.columns.forEach((column, index) => {
    const rowY = table.y + 44 + index * 22;
    if (index % 2 === 1) {
      pieces.push(
        `<rect class="row-alt" x="${table.x + 1}" y="${rowY}" width="${table.w - 2}" height="22"/>`
      );
    }
    if (column.isForeignKey) {
      pieces.push(
        `<rect class="row-fk" x="${table.x + 1}" y="${rowY}" width="${table.w - 2}" height="22"/>`
      );
    }

    const tags = [];
    if (column.isPrimary) tags.push('PK');
    if (column.isForeignKey) tags.push('FK');
    if (column.isUnique && !column.isPrimary) tags.push('UQ');
    if (column.nullable) tags.push('?');

    const typeLabel = `${column.type}${tags.length ? ` ${tags.join(' ')}` : ''}`;
    pieces.push(
      `<text class="col-name" x="${table.x + 16}" y="${rowY + 15}">${escapeXml(fit(column.name, 24))}</text>`
    );
    pieces.push(
      `<text class="col-type" x="${table.x + table.w - 16}" y="${rowY + 15}" text-anchor="end">${escapeXml(fit(typeLabel, 20))}</text>`
    );
  });

  pieces.push('</g>');
  return pieces.join('\n');
}

function drawEdge(edge) {
  const color = edge.child.accent;
  const optionalClass = edge.columnMeta && edge.columnMeta.nullable ? ' edge-optional' : '';
  const path = edge.tableName === edge.referencedTable ? selfPath(edge) : routedPath(edge);
  edge.badge = path.badge;

  return `<path class="edge${optionalClass}" d="${path.d}" stroke="${color}" marker-end="url(#arrow)"/>`;
}

function drawBadge(edge) {
  const color = edge.child.accent;
  const { x, y } = edge.badge;
  return [
    `<circle cx="${x}" cy="${y}" r="11" fill="${color}" stroke="#ffffff" stroke-width="2"/>`,
    `<text class="badge-text" x="${x}" y="${y + 3.8}" text-anchor="middle">${edge.id}</text>`,
  ].join('\n');
}

function routedPath(edge) {
  const side = chooseSides(edge);
  const from = anchor(edge.child, side.from, edge.groupIndex, edge.groupSize);
  const to = anchor(edge.parent, side.to, edge.groupIndex, edge.groupSize);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horizontal = side.from === 'left' || side.from === 'right';

  if (horizontal) {
    const midX = from.x + dx / 2;
    return {
      d: `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`,
      badge: { x: midX, y: from.y + dy / 2 },
    };
  }

  const midY = from.y + dy / 2;
  return {
    d: `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`,
    badge: { x: from.x + dx / 2, y: midY },
  };
}

function selfPath(edge) {
  const table = edge.child;
  const start = {
    x: table.x + table.w,
    y: table.y + 122,
  };
  const end = {
    x: table.x + table.w,
    y: table.y + 178,
  };
  return {
    d: `M ${start.x} ${start.y} C ${start.x + 86} ${start.y}, ${start.x + 86} ${end.y}, ${end.x} ${end.y}`,
    badge: { x: start.x + 80, y: start.y + 28 },
  };
}

function chooseSides(edge) {
  const dx = edge.parent.cx - edge.child.cx;
  const dy = edge.parent.cy - edge.child.cy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { from: 'right', to: 'left' }
      : { from: 'left', to: 'right' };
  }

  return dy >= 0
    ? { from: 'bottom', to: 'top' }
    : { from: 'top', to: 'bottom' };
}

function anchor(table, side, index, total) {
  const offset = (index + 1) / (total + 1);

  if (side === 'left') {
    return { x: table.x, y: table.y + table.h * (0.18 + offset * 0.64) };
  }
  if (side === 'right') {
    return { x: table.x + table.w, y: table.y + table.h * (0.18 + offset * 0.64) };
  }
  if (side === 'top') {
    return { x: table.x + table.w * (0.18 + offset * 0.64), y: table.y };
  }
  return { x: table.x + table.w * (0.18 + offset * 0.64), y: table.y + table.h };
}

function groupEdges(edges) {
  const groups = new Map();
  edges.forEach((edge) => {
    const key = `${edge.tableName}->${edge.referencedTable}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edge);
  });
  return groups;
}

function drawRelationshipPanel(edges, y) {
  const rowsPerColumn = Math.ceil(edges.length / 2);
  const pieces = [
    `<g transform="translate(40 ${y})">`,
    '<rect x="0" y="0" width="1470" height="280" rx="8" fill="#ffffff" stroke="#cbd5e1"/>',
    `<text class="panel-title" x="18" y="28">Foreign Key Connections (${edges.length})</text>`,
  ];

  edges.forEach((edge, index) => {
    const column = index < rowsPerColumn ? 0 : 1;
    const row = index % rowsPerColumn;
    const x = 18 + column * 720;
    const rowY = 56 + row * 21;
    const optional = edge.columnMeta && edge.columnMeta.nullable ? ' nullable' : '';
    const text = `${edge.id}. ${edge.tableName}.${edge.column} -> ${edge.referencedTable}.${edge.referencedColumn} [delete ${edge.onDelete}${optional}]`;

    pieces.push(`<text class="rel" x="${x}" y="${rowY}">${escapeXml(text)}</text>`);
  });

  pieces.push('</g>');
  return pieces.join('\n');
}

function fit(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeAttr(value) {
  return escapeXml(value).replace(/\s+/g, '-');
}

main();
