exports.up = (pgm) => {
  pgm.createTable('ai_conversations', {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    session_id:    { type: 'uuid', notNull: true },
    restaurant_id: { type: 'uuid', notNull: true, references: '"restaurants"', onDelete: 'CASCADE' },
    user_id:       { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    role:          { type: 'varchar(20)', notNull: true, check: "role IN ('user','assistant','tool')" },
    content:       { type: 'text', notNull: true },
    // Set on role='tool' rows — an executed (confirmed) write action, kept for audit
    tool_name:     { type: 'text' },
    created_at:    { type: 'timestamptz', notNull: true, default: 'NOW()' },
  });

  pgm.createIndex('ai_conversations', ['session_id', 'created_at']);
  pgm.createIndex('ai_conversations', ['restaurant_id', 'created_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('ai_conversations');
};
