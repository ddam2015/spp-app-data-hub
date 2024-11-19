const accessPoint = require('../logic/accessPoint');

// Utility function to enforce a timeout on any async operation
const withTimeout = (promise, ms, connection) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Query timed out'));
        if (connection) connection.destroy(); // Forcefully close the connection on timeout
      }, ms);
    })
  ]);
};

const publicBoxScore = async (args, context, dbAlias) => {
  const { teamId, selectYear, gameId, maxResultsPerDivision } = args;

  // Assuming select_year is a date range in the format: '2023-09-01 AND 2024-08-31'
  const [startDate, endDate] = selectYear.split(' AND ');

  // Define the query for setting group_concat_max_len
  const setQuery = `SET SESSION group_concat_max_len = 10000000000;`;

  // Define the main query using placeholders for safer parameterized queries
  const mainQuery = `
    SELECT tb_3.*
    FROM (
    SELECT team_id, team_level, full_team_name, org_logo, win, loss, pct, ppg, opp_ppg, box_score
    FROM (
    SELECT team_id, team_level, org_logo, CONCAT(org_name,' ',team_name) AS full_team_name, COUNT(CASE
    WHEN game_result_label = 'W'
    THEN 1 END) AS win, COUNT(CASE
    WHEN game_result_label = 'L'
    THEN 1 END) AS loss, COUNT(CASE
    WHEN game_result_label = 'W'
    THEN 1 END) / (COUNT(CASE
    WHEN game_result_label = 'W'
    THEN 1 END) + COUNT(CASE
    WHEN game_result_label = 'L'
    THEN 1 END)) AS pct, ( IF(SUM( CASE
    WHEN game_result_label = 'W'
    AND home_team_score > away_team_score
    THEN home_team_score
    WHEN game_result_label = 'W'
    AND home_team_score < away_team_score
    THEN away_team_score
    END ) IS NULL, '0', SUM( CASE
    WHEN game_result_label = 'W'
    AND home_team_score > away_team_score
    THEN home_team_score
    WHEN game_result_label = 'W'
    AND home_team_score < away_team_score
    THEN away_team_score
    END )) + IF( SUM( CASE
    WHEN game_result_label = 'L'
    AND home_team_score > away_team_score
    THEN away_team_score
    WHEN game_result_label = 'L'
    AND home_team_score < away_team_score
    THEN home_team_score
    END ) IS NULL, '0', SUM( CASE
    WHEN game_result_label = 'L'
    AND home_team_score > away_team_score
    THEN away_team_score
    WHEN game_result_label = 'L'
    AND home_team_score < away_team_score
    THEN home_team_score
    END ) ))/(COUNT(CASE
    WHEN game_result_label = 'W'
    THEN 1 END) + COUNT(CASE
    WHEN game_result_label = 'L'
    THEN 1 END)) AS ppg, ( IF( SUM(CASE
    WHEN game_result_label = 'L'
    AND home_team_score > away_team_score
    THEN home_team_score
    WHEN game_result_label = 'L'
    AND home_team_score < away_team_score
    THEN away_team_score END) IS NULL, '0', SUM(CASE
    WHEN game_result_label = 'L'
    AND home_team_score > away_team_score
    THEN home_team_score
    WHEN game_result_label = 'L'
    AND home_team_score < away_team_score
    THEN away_team_score END)) + IF(SUM(CASE
    WHEN game_result_label = 'W'
    AND home_team_score > away_team_score
    THEN away_team_score
    WHEN game_result_label = 'W'
    AND home_team_score < away_team_score
    THEN home_team_score END) IS NULL, '0', SUM(CASE
    WHEN game_result_label = 'W'
    AND home_team_score > away_team_score
    THEN away_team_score
    WHEN game_result_label = 'W'
    AND home_team_score < away_team_score
    THEN home_team_score END)) )/(COUNT(CASE
    WHEN game_result_label = 'W'
    THEN 1 END) + COUNT(CASE
    WHEN game_result_label = 'L'
    THEN 1 END)) AS opp_ppg, GROUP_CONCAT('{"event_name": "',event_name,'", "event_id": "',event_id,'", "team_name": "',CONCAT(org_name,' ',team_name),'", "team_logo": "',IF(org_logo IS NULL, '', org_logo),'", "org_nickname": "',org_nickname,'", "game_id": "',game_id,'", "gm_r_label": "',game_result_label,'", "game_result": ','"(',game_result,')"',', "opp_logo": "',IF(opp_logo IS NULL, '', opp_logo),'", "opp_name": "',opp_name,'", "opp_nickname": "',opp_nickname,'", "player_stat": [',game_data,']}') AS box_score
    FROM (
    SELECT inner_tb.*, ( CASE
    WHEN game_result_label = 'W'
    AND home_team_score < away_team_score
    THEN CONCAT( '[{"pl_data": [', (SELECT GROUP_CONCAT('{"player_info": {"player_id": "',(pl.id),'", "player_name": "',REPLACE(pl.name,'"',''),'", "player_nickname": "',REPLACE(pl.nickname,'"',''),'", "stats": ',st.stats,'}}') from ${dbAlias}_games gm left join ${dbAlias}_stats st on gm.id = st.game left join ${dbAlias}_players pl on pl.id = st.player left join ${dbAlias}_rosters ros on ros.id = gm.away_team where gm.id = game_id
    AND ros.players LIKE CONCAT('%"',pl.id,'":%')), ']}', ',{"opp_data": [', (SELECT GROUP_CONCAT('{"player_info": {"player_id": "',(pl.id),'", "player_name": "',REPLACE(pl.name,'"',''),'", "player_nickname": "',REPLACE(pl.nickname,'"',''),'", "stats": ',st.stats,'}}') from ${dbAlias}_games gm left join ${dbAlias}_stats st on gm.id = st.game left join ${dbAlias}_players pl on pl.id = st.player left join ${dbAlias}_rosters ros on ros.id = gm.home_team where gm.id = game_id
    AND ros.players LIKE CONCAT('%"',pl.id,'":%')),']', '}]')
    WHEN game_result_label = 'W'
    AND home_team_score > away_team_score
    THEN CONCAT( '[{"pl_data": [', (SELECT GROUP_CONCAT('{"player_info": {"player_id": "',(pl.id),'", "player_name": "',REPLACE(pl.name,'"',''),'", "player_nickname": "',REPLACE(pl.nickname,'"',''),'", "stats": ',st.stats,'}}') from ${dbAlias}_games gm left join ${dbAlias}_stats st on gm.id = st.game left join ${dbAlias}_players pl on pl.id = st.player left join ${dbAlias}_rosters ros on ros.id = gm.home_team where gm.id = game_id
    AND ros.players LIKE CONCAT('%"',pl.id,'":%')), ']}', ',{"opp_data": [', (SELECT GROUP_CONCAT('{"player_info": {"player_id": "',(pl.id),'", "player_nickname": "',REPLACE(pl.nickname,'"',''),'", "player_name": "',REPLACE(pl.name,'"',''),'", "stats": ',st.stats,'}}') from ${dbAlias}_games gm left join ${dbAlias}_stats st on gm.id = st.game left join ${dbAlias}_players pl on pl.id = st.player left join ${dbAlias}_rosters ros on ros.id = gm.away_team where gm.id = game_id
    AND ros.players LIKE CONCAT('%"',pl.id,'":%')),']', '}]')
    WHEN game_result_label = 'L'
    AND home_team_score < away_team_score
    THEN CONCAT( '[{"pl_data": [', (SELECT GROUP_CONCAT('{"player_info": {"player_id": "',(pl.id),'", "player_name": "',REPLACE(pl.name,'"',''),'", "player_nickname": "',REPLACE(pl.nickname,'"',''),'", "stats": ',st.stats,'}}') from ${dbAlias}_games gm left join ${dbAlias}_stats st on gm.id = st.game left join ${dbAlias}_players pl on pl.id = st.player left join ${dbAlias}_rosters ros on ros.id = gm.home_team where gm.id = game_id
    AND ros.players LIKE CONCAT('%"',pl.id,'":%')), ']}', ',{"opp_data": [', (SELECT GROUP_CONCAT('{"player_info": {"player_id": "',(pl.id),'", "player_name": "',REPLACE(pl.name,'"',''),'", "player_nickname": "',REPLACE(pl.nickname,'"',''),'", "stats": ',st.stats,'}}') from ${dbAlias}_games gm left join ${dbAlias}_stats st on gm.id = st.game left join ${dbAlias}_players pl on pl.id = st.player left join ${dbAlias}_rosters ros on ros.id = gm.away_team where gm.id = game_id
    AND ros.players LIKE CONCAT('%"',pl.id,'":%')),']', '}]')
    WHEN game_result_label = 'L'
    AND home_team_score > away_team_score
    THEN CONCAT( '[{"pl_data": [', (SELECT GROUP_CONCAT('{"player_info": {"player_id": "',(pl.id),'", "player_name": "',REPLACE(pl.name,'"',''),'", "player_nickname": "',REPLACE(pl.nickname,'"',''),'", "stats": ',st.stats,'}}') from ${dbAlias}_games gm left join ${dbAlias}_stats st on gm.id = st.game left join ${dbAlias}_players pl on pl.id = st.player left join ${dbAlias}_rosters ros on ros.id = gm.away_team where gm.id = game_id
    AND ros.players LIKE CONCAT('%"',pl.id,'":%')), ']}', ',{"opp_data": [', (SELECT GROUP_CONCAT('{"player_info": {"player_id": "',(pl.id),'", "player_name": "',REPLACE(pl.name,'"',''),'", "player_nickname": "',REPLACE(pl.nickname,'"',''),'", "stats": ',st.stats,'}}') from ${dbAlias}_games gm left join ${dbAlias}_stats st on gm.id = st.game left join ${dbAlias}_players pl on pl.id = st.player left join ${dbAlias}_rosters ros on ros.id = gm.home_team where gm.id = game_id
    AND ros.players LIKE CONCAT('%"',pl.id,'":%')),']', '}]') END) AS game_data
    FROM (
    SELECT orgs.profile_img AS org_logo, rosters.id AS roster_id, rosters.division AS level_of_play, events.eventtime AS event_time, events.id AS event_id, events.name AS event_name, games.id AS game_id, games.home_team_score AS home_team_score, games.court AS game_court, games.start_time AS game_time, games.away_team_score AS away_team_score, games.home_team AS home_team_id, games.away_team AS away_team_id, teams.id AS team_id, teams.search_list AS team_name, orgs.name AS org_name, orgs.nickname AS org_nickname, orgs.id AS org_id, teams.level AS team_level, IF( rosters.id = games.home_team, games.away_team, games.home_team ) AS opponent_id, (SELECT CONCAT(orgs_2.name,' ', tm.search_list)
    FROM ${dbAlias}_organizations orgs_2
    INNER JOIN ${dbAlias}_rosters rosters_2
    ON rosters_2.org = orgs_2.id
    INNER JOIN ${dbAlias}_teams tm
    ON tm.id = rosters_2.team
    WHERE rosters_2.id = IF( rosters.id = games.home_team, games.away_team, games.home_team )) AS opp_name, (SELECT orgs_2.nickname
    FROM ${dbAlias}_organizations orgs_2
    INNER JOIN ${dbAlias}_rosters rosters_2
    ON rosters_2.org = orgs_2.id
    INNER JOIN ${dbAlias}_teams tm
    ON tm.id = rosters_2.team
    WHERE rosters_2.id = IF( rosters.id = games.home_team, games.away_team, games.home_team )) AS opp_nickname, (SELECT orgs_3.profile_img
    FROM ${dbAlias}_organizations orgs_3
    INNER JOIN ${dbAlias}_rosters rosters_3
    ON rosters_3.org = orgs_3.id
    WHERE rosters_3.id = IF( rosters.id = games.home_team, games.away_team, games.home_team )) AS opp_logo, ( CASE
    WHEN rosters.id = games.home_team
    AND (games.home_team_score > games.away_team_score)
    THEN CONCAT('W ', games.home_team_score, ' - ', games.away_team_score)
    WHEN rosters.id = games.home_team
    AND (games.home_team_score < games.away_team_score)
    THEN CONCAT('L ', games.home_team_score, ' - ', games.away_team_score)
    WHEN rosters.id = games.away_team
    AND (games.away_team_score > games.home_team_score)
    THEN CONCAT('W ', games.away_team_score, ' - ', games.home_team_score)
    WHEN rosters.id = games.away_team
    AND (games.away_team_score < games.home_team_score)
    THEN CONCAT('L ', games.away_team_score, ' - ', games.home_team_score)
    ELSE ''
    END ) AS game_result, ( CASE
    WHEN rosters.id = games.home_team
    AND (games.home_team_score > games.away_team_score)
    THEN CONCAT('W')
    WHEN rosters.id = games.home_team
    AND (games.home_team_score < games.away_team_score)
    THEN CONCAT('L')
    WHEN rosters.id = games.away_team
    AND (games.away_team_score > games.home_team_score)
    THEN CONCAT('W')
    WHEN rosters.id = games.away_team
    AND (games.away_team_score < games.home_team_score)
    THEN CONCAT('L')
    ELSE ''
    END ) AS game_result_label
    FROM ${dbAlias}_rosters rosters
    INNER JOIN ${dbAlias}_organizations orgs
    ON orgs.id = rosters.org
    INNER JOIN ${dbAlias}_games games
    ON games.home_team = rosters.id
    OR games.away_team = rosters.id
    INNER JOIN ${dbAlias}_teams teams
    ON rosters.team = teams.id
    INNER JOIN ${dbAlias}_events events
    ON rosters.event = events.id
    WHERE teams.id = ?
    AND games.id = ?
    AND start_time BETWEEN ?
    AND ? ) inner_tb ) tb_1
    GROUP BY team_id, org_logo, full_team_name
    ORDER BY win DESC ) tb_2 ) tb_3
    INNER JOIN (
    SELECT pl_stat, team_level, GROUP_CONCAT(full_team_name
    ORDER BY win DESC) grouped_year
    FROM (
    SELECT pl_stat, win, team_level, full_team_name
    FROM (
    SELECT pl_stat, team_id, team_level, org_logo, CONCAT(org_name,' ',team_name) AS full_team_name, COUNT(CASE
    WHEN game_result_label = 'W'
    THEN 1 END) AS win, COUNT(CASE
    WHEN game_result_label = 'L'
    THEN 1 END) AS loss, COUNT(CASE
    WHEN game_result_label = 'W'
    THEN 1 END) / (COUNT(CASE
    WHEN game_result_label = 'W'
    THEN 1 END) + COUNT(CASE
    WHEN game_result_label = 'L'
    THEN 1 END)) AS pct, ( IF(SUM( CASE
    WHEN game_result_label = 'W'
    AND home_team_score > away_team_score
    THEN home_team_score
    WHEN game_result_label = 'W'
    AND home_team_score < away_team_score
    THEN away_team_score
    END ) IS NULL, '0', SUM( CASE
    WHEN game_result_label = 'W'
    AND home_team_score > away_team_score
    THEN home_team_score
    WHEN game_result_label = 'W'
    AND home_team_score < away_team_score
    THEN away_team_score
    END )) + IF( SUM( CASE
    WHEN game_result_label = 'L'
    AND home_team_score > away_team_score
    THEN away_team_score
    WHEN game_result_label = 'L'
    AND home_team_score < away_team_score
    THEN home_team_score
    END ) IS NULL, '0', SUM( CASE
    WHEN game_result_label = 'L'
    AND home_team_score > away_team_score
    THEN away_team_score
    WHEN game_result_label = 'L'
    AND home_team_score < away_team_score
    THEN home_team_score
    END ) ))/(COUNT(CASE
    WHEN game_result_label = 'W'
    THEN 1 END) + COUNT(CASE
    WHEN game_result_label = 'L'
    THEN 1 END)) AS ppg, ( IF( SUM(CASE
    WHEN game_result_label = 'L'
    AND home_team_score > away_team_score
    THEN home_team_score
    WHEN game_result_label = 'L'
    AND home_team_score < away_team_score
    THEN away_team_score END) IS NULL, '0', SUM(CASE
    WHEN game_result_label = 'L'
    AND home_team_score > away_team_score
    THEN home_team_score
    WHEN game_result_label = 'L'
    AND home_team_score < away_team_score
    THEN away_team_score END)) + IF(SUM(CASE
    WHEN game_result_label = 'W'
    AND home_team_score > away_team_score
    THEN away_team_score
    WHEN game_result_label = 'W'
    AND home_team_score < away_team_score
    THEN home_team_score END) IS NULL, '0', SUM(CASE
    WHEN game_result_label = 'W'
    AND home_team_score > away_team_score
    THEN away_team_score
    WHEN game_result_label = 'W'
    AND home_team_score < away_team_score
    THEN home_team_score END)) )/(COUNT(CASE
    WHEN game_result_label = 'W'
    THEN 1 END) + COUNT(CASE
    WHEN game_result_label = 'L'
    THEN 1 END)) AS opp_ppg
    FROM (
    SELECT orgs.profile_img AS org_logo, rosters.id AS roster_id, rosters.division AS level_of_play, events.eventtime AS event_time, events.id AS event_id, events.name AS event_name, games.id AS game_id, games.home_team_score AS home_team_score, games.court AS game_court, games.start_time AS game_time, games.away_team_score AS away_team_score, games.home_team AS home_team_id, games.away_team AS away_team_id, teams.id AS team_id, teams.search_list AS team_name, orgs.name AS org_name, orgs.nickname AS org_nickname, orgs.id AS org_id, teams.level AS team_level, IF( rosters.id = games.home_team, games.away_team, games.home_team ) AS opponent_id, ( CASE
    WHEN rosters.id = games.home_team
    AND (games.home_team_score > games.away_team_score)
    THEN CONCAT('W ', games.home_team_score, ' - ', games.away_team_score)
    WHEN rosters.id = games.home_team
    AND (games.home_team_score < games.away_team_score)
    THEN CONCAT('L ', games.home_team_score, ' - ', games.away_team_score)
    WHEN rosters.id = games.away_team
    AND (games.away_team_score > games.home_team_score)
    THEN CONCAT('W ', games.away_team_score, ' - ', games.home_team_score)
    WHEN rosters.id = games.away_team
    AND (games.away_team_score < games.home_team_score)
    THEN CONCAT('L ', games.away_team_score, ' - ', games.home_team_score)
    ELSE ''
    END ) AS game_result, ( CASE
    WHEN rosters.id = games.home_team
    AND (games.home_team_score > games.away_team_score)
    THEN CONCAT('W')
    WHEN rosters.id = games.home_team
    AND (games.home_team_score < games.away_team_score)
    THEN CONCAT('L')
    WHEN rosters.id = games.away_team
    AND (games.away_team_score > games.home_team_score)
    THEN CONCAT('W')
    WHEN rosters.id = games.away_team
    AND (games.away_team_score < games.home_team_score)
    THEN CONCAT('L')
    ELSE ''
    END ) AS game_result_label, (SELECT GROUP_CONCAT(st.stats)
    FROM ${dbAlias}_stats st
    INNER JOIN ${dbAlias}_games gm_2
    ON gm_2.id = st.game
    WHERE gm_2.id = game_id) AS pl_stat
    FROM ${dbAlias}_rosters rosters
    INNER JOIN ${dbAlias}_organizations orgs
    ON orgs.id = rosters.org
    INNER JOIN ${dbAlias}_games games
    ON games.home_team = rosters.id
    OR games.away_team = rosters.id
    INNER JOIN ${dbAlias}_teams teams
    ON rosters.team = teams.id
    INNER JOIN ${dbAlias}_events events
    ON rosters.event = events.id
    WHERE teams.id = ?
    AND games.id = ?
    AND start_time BETWEEN ?
    AND ?
    ORDER BY events.eventtime DESC , teams.level ASC, games.start_time DESC ) sec_tb_1
    GROUP BY team_id, org_logo, full_team_name
    ORDER BY win DESC, pct DESC ) sec_tb_2 ) sec_tb_3
    GROUP BY team_level) group_max
    ON tb_3.team_level = group_max.team_level
    AND FIND_IN_SET(full_team_name, grouped_year) <= ?
    ORDER BY tb_3.team_level DESC, tb_3.win DESC;
 `;

  // Get request URL and initialize the MySQL pool
  const requestUrl = context.req.protocol + '://' + context.req.get('host') + context.req.originalUrl;
  const sppUrl = accessPoint(requestUrl);
  let connection;

  try {
    // Get connection from the pool
    connection = await sppUrl.getConnection();
    
    // First, execute the SET query
    await connection.query(setQuery);

    // Set a timeout for the query execution (e.g., 5 seconds)
    const timeoutMs = 5000;
    const [rows] = await withTimeout(
      connection.query(mainQuery, [
      teamId, gameId, startDate, endDate, teamId, gameId, startDate, endDate, maxResultsPerDivision
    ]),
      timeoutMs,
      connection // Pass the connection so we can destroy it on timeout
    );

    return rows;
  } catch (error) {
    console.error('Error executing MySQL query or timeout occurred:', error);
    throw new Error(error.message || 'Failed to fetch data');
  } finally {
    // Release the connection back to the pool or forcefully close if timed out
    if (connection) connection.release();
  }
};

module.exports = publicBoxScore;
