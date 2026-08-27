// Stores the output of the weekly AI waste root-cause analysis (AI Plan Phase 1A).
// One row per restaurant per generated period: the raw weather series, the
// computed correlation scores, the narrated analysis, and structured
// recommendations. The "AI Insights" tab on /waste-log reads the latest row,
// so the expensive work (weather fetch + correlation + LLM call) runs once.

exports.up = (pgm) => {
  pgm.createTable('waste_insights', {
    id:                 { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    restaurant_id:      { type: 'uuid', notNull: true, references: '"restaurants"', onDelete: 'CASCADE' },
    period_start:       { type: 'date', notNull: true },
    period_end:         { type: 'date', notNull: true },
    weather_data:       { type: 'jsonb' },          // daily rainfall/temp series, or null when no coords
    correlation_scores: { type: 'jsonb' },          // { rainfall_r, temp_r, weekday[], top_items[], reasons[] }
    analysis:           { type: 'text' },            // narrated summary (LLM, or deterministic fallback)
    recommendations:    { type: 'jsonb' },          // [{ ingredient, action, quantified_impact }]
    generated_by:       { type: 'varchar(20)', notNull: true, default: 'cron' }, // 'cron' | 'manual'
    created_at:         { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('waste_insights', ['restaurant_id', 'created_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('waste_insights');
};
