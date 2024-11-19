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

const publicTeamStandingGameResult = async (args, context, dbAlias) => {
  const { brand, select_year, teamOrg, teamId } = args;

  // Assuming select_year is a date range in the format: '2023-09-01 AND 2024-08-31'
  const [startDate, endDate] = select_year.split(' AND ');

  // Define the query using placeholders for safer parameterized queries
  const query = `
    WITH CTE_Events AS (
            SELECT 
                id AS event_id, 
                name AS event_name
            FROM 
                ${dbAlias}_events
            WHERE 
                org = ?
                AND eventtime BETWEEN ? AND ?
                AND enabled = 1
                AND type NOT IN (5, 6, 7, 8)
        ),

        -- Get all the rosters for the given organization and team
        CTE_Rosters AS (
            SELECT 
                E.event_id, 
                E.event_name, 
                R.id AS roster_id, 
                R.org, 
                R.team AS team_id
            FROM 
                CTE_Events AS E
            LEFT JOIN 
                ${dbAlias}_rosters AS R
            ON 
                E.event_id = R.event
            WHERE 
                R.org = ?
                AND R.team = ?
        ),

        -- Get all the games for the rosters
        CTE_Games AS (
            SELECT 
                G.id game_id,
                R.event_id, 
                R.event_name, 
                R.org, 
                R.team_id,
                CASE WHEN R.roster_id = G.home_team THEN G.home_team ELSE G.away_team END AS roster_id,
                CASE WHEN R.roster_id = G.home_team THEN G.home_team_score ELSE G.away_team_score END AS score,
                CASE WHEN R.roster_id = G.home_team THEN G.away_team ELSE G.home_team END AS opp_roster_id,
                CASE WHEN R.roster_id = G.home_team THEN G.away_team_score ELSE G.home_team_score END AS opp_score
            FROM 
                CTE_Rosters AS R
            LEFT JOIN 
                ${dbAlias}_games AS G
            ON 
                R.roster_id = G.home_team OR R.roster_id = G.away_team
            WHERE home_team_score IS NOT NULL and away_team_score IS NOT NULL
        ),

        -- Get outcome of game (W/L) for each game
        CTE_WL AS (
            SELECT 
                *, 
                CASE WHEN score > opp_score THEN 'W' ELSE 'L' END AS outcome
            FROM 
                CTE_Games
        ),

        -- Get the organization name and profile image
        CTE_OrgDetails AS (
            SELECT 
                WL.*, 
                O.name, 
                O.profile_img
            FROM 
                CTE_WL AS WL
            LEFT JOIN 
                ${dbAlias}_organizations AS O
            ON 
                WL.org = O.id
        ),

        -- Get the opponents roster details
        CTE_OppRoster AS (
            SELECT 
                OD.*, 
                R.org AS opp_org_id, 
                R.team AS opp_team_id
            FROM 
                CTE_OrgDetails AS OD
            LEFT JOIN 
                ${dbAlias}_rosters AS R
            ON 
                OD.opp_roster_id = R.id
        ),

        -- Get the opponents organization details
        CTE_OppOrgDetails AS (
            SELECT 
                R.*, 
                O.name AS opp_name, 
                O.profile_img AS opp_profile_img
            FROM 
                CTE_OppRoster AS R
            LEFT JOIN 
                ${dbAlias}_organizations AS O
            ON 
                R.opp_org_id = O.id
        ),

        -- Get the team level and name
        CTE_Team AS (
            SELECT 
                OOD.*, 
                T.level, 
                T.name AS team_name
            FROM 
                CTE_OppOrgDetails AS OOD
            LEFT JOIN 
                ${dbAlias}_teams AS T
            ON 
                OOD.team_id = T.id
        ),

        -- Get the opponent team level and name
        CTE_OppTeam AS (
            SELECT 
                CTE_Team.*, 
                T.level AS opp_level, 
                T.name AS opp_team_name
            FROM 
                CTE_Team
            LEFT JOIN 
                ${dbAlias}_teams AS T
            ON 
                CTE_Team.opp_team_id = T.id
        )

        -- Final query to combine everything
        SELECT 
            team_id,
            event_id,
            game_id,
            event_name,
            org,
            roster_id,
            score,
            opp_org_id,
            opp_roster_id,
            opp_score,
            outcome,
            level,
            CONCAT(name, ' ', level, 'U ', team_name) AS full_team_name,
            profile_img AS org_logo,
            CONCAT(opp_name, ' ', opp_level, 'U ', opp_team_name) AS opp_full_team_name,
            opp_profile_img AS opp_org_logo
        FROM 
            CTE_OppTeam;
  `;

  // Get request URL and initialize the MySQL pool
  const requestUrl = context.req.protocol + '://' + context.req.get('host') + context.req.originalUrl;
  const sppUrl = accessPoint(requestUrl);
  let connection;

  try {
    // Get connection from the pool
    connection = await sppUrl.getConnection();

    // Set a timeout for the query execution (e.g., 5 seconds)
    const timeoutMs = 5000;
    const [rows] = await withTimeout(
      connection.query(query, [
      brand, startDate, endDate, teamOrg, teamId
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

module.exports = publicTeamStandingGameResult;