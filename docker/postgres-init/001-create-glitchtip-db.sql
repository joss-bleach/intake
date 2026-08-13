-- Only runs when the postgres container's data volume is first initialized
-- (docker-entrypoint-initdb.d convention) — safe to leave un-guarded.
-- GlitchTip gets its own database on the same shared instance (issue #49),
-- rather than a separate Postgres container, per the ticket's own choice.
CREATE DATABASE glitchtip;
