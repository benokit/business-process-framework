# sequence-generator-postgresql

Implements `next-sequence-value` of [sequence-generator](../sequence-generator/README.md) for `postgresql-database`: a PostgreSQL sequence per name, created on first use. Its effect is `irreversible`: a PostgreSQL sequence never gives a number back, so a rolled-back transaction leaves a gap.
