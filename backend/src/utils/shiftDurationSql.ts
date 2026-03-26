function qualify(alias: string | undefined, column: string): string {
  return alias ? `${alias}.${column}` : column;
}

export function shiftDurationMinutesSql(alias?: string): string {
  const startTime = qualify(alias, 'start_time');
  const endTime = qualify(alias, 'end_time');

  return `CASE
            WHEN ${startTime} IS NULL OR ${endTime} IS NULL THEN 0
            WHEN ${endTime} >= ${startTime}
              THEN EXTRACT(EPOCH FROM (${endTime} - ${startTime})) / 60
            ELSE 1440 + EXTRACT(EPOCH FROM (${endTime} - ${startTime})) / 60
          END`;
}

export function shiftDurationHoursSql(alias?: string): string {
  return `(${shiftDurationMinutesSql(alias)} / 60.0)`;
}
