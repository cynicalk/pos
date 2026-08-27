exports.up = (pgm) => {
  // role='summary' rows hold compacted history; covers_until marks the last
  // message timestamp the summary includes, so replay = summary + rows after it
  pgm.dropConstraint('ai_conversations', 'ai_conversations_role_check');
  pgm.addConstraint('ai_conversations', 'ai_conversations_role_check', {
    check: "role IN ('user','assistant','tool','summary')",
  });
  pgm.addColumn('ai_conversations', {
    covers_until: { type: 'timestamptz' },
  });
};

exports.down = (pgm) => {
  pgm.sql("DELETE FROM ai_conversations WHERE role = 'summary'");
  pgm.dropColumn('ai_conversations', 'covers_until');
  pgm.dropConstraint('ai_conversations', 'ai_conversations_role_check');
  pgm.addConstraint('ai_conversations', 'ai_conversations_role_check', {
    check: "role IN ('user','assistant','tool')",
  });
};
