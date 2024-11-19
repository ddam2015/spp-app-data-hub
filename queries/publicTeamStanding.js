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

// Define the publicTeamStanding function
const publicTeamStanding = async (args, context, dbAlias) => {
  const { brand, select_year, level_of_play, division, win_loss_percent_cutoff, show_girls, max_results_per_division } = args;

  // Assuming select_year is a date range in the format: '2023-09-01 AND 2024-08-31'
  const [startDate, endDate] = select_year.split(' AND ');

  const query = `
    WITH CTE_Events AS (
      SELECT id, name
      FROM ${dbAlias}_events
      WHERE org = (
        SELECT id
        FROM ${dbAlias}_organizations
        WHERE id = ?
      )
      AND eventtime BETWEEN ? AND ?
      AND enabled = 1
      AND type NOT IN (5, 6, 7, 8)
    ),
    CTE_Games AS (
      SELECT *
      FROM ${dbAlias}_games
      WHERE start_time BETWEEN ? AND ?
      AND event_id IN (SELECT id FROM CTE_Events)
    ),
    CTE_GamesWL AS (
      SELECT 
        event_id,
        home_team AS roster_id,
        home_team_score AS points_for,
        away_team_score AS points_against,
        home_team_score > away_team_score AS is_win
      FROM CTE_Games
      UNION ALL
      SELECT 
        event_id,
        away_team AS roster_id,
        away_team_score AS points_for,
        home_team_score AS points_against,
        home_team_score < away_team_score AS is_win
      FROM CTE_Games
      WHERE home_team_score IS NOT NULL AND away_team_score IS NOT NULL
    ),
    CTE_WLByRoster AS (
        SELECT 
          roster_id,
          SUM(CASE WHEN is_win = 1 THEN 1 ELSE 0 END) AS total_wins,
          SUM(CASE WHEN is_win = 0 THEN 1 ELSE 0 END) AS total_losses,
          SUM(points_for) AS total_points_for,
          SUM(points_against) AS total_points_against,
          COUNT(*) AS games_played
        FROM CTE_GamesWL
        WHERE points_for IS NOT NULL AND points_against IS NOT NULL
        GROUP BY roster_id
    ),
    CTE_RosterDetails AS (
      SELECT WLBR.*, R.org, R.team, 
      CASE WHEN ? = 'All' THEN 'All' ELSE R.division END AS level_of_play
      FROM CTE_WLByRoster AS WLBR
      LEFT JOIN ${dbAlias}_rosters AS R ON WLBR.roster_id = R.id
    ),
    CTE_OrgDetails AS (
      SELECT R.*, O.name, O.profile_img
      FROM CTE_RosterDetails AS R
      LEFT JOIN ${dbAlias}_organizations AS O ON R.org = O.id
    ),
    CTE_Team AS (
      SELECT O.*, T.level as division, T.name AS team_name
      FROM CTE_OrgDetails AS O
      LEFT JOIN ${dbAlias}_teams AS T ON O.team = T.id
    ),
    CTE_WinPercentage AS (
      SELECT
        org AS org_id,
        team as team_id,
        level_of_play,
        division,
        name as team_name, 
        team_name as team_description,
        CONCAT(name, ' ', division, 'U ', team_name) AS full_team_name,
        profile_img as org_logo,
        SUM(total_wins) AS total_wins,
        SUM(total_losses) AS total_losses,
        CASE 
          WHEN (SUM(total_wins) + SUM(total_losses)) = 0 THEN 0 
          ELSE SUM(total_wins) / NULLIF(SUM(total_wins) + SUM(total_losses), 0) 
        END AS win_percentage,
        SUM(total_points_for) / SUM(games_played) AS ppg,
        SUM(total_points_against) / SUM(games_played) AS opp_ppg
      FROM CTE_Team
      GROUP BY name, level_of_play, team_name, org, profile_img, team, division
    ),
    CTE_FilteredResults AS (
      SELECT *,
        CASE WHEN ? = 'All' THEN 1 ELSE division = ? END AS division_match
      FROM CTE_WinPercentage
      WHERE
        win_percentage >= ?
        AND ${show_girls ? '1=1' : `division NOT IN (39, 40, 41, 42, 43, 44, 45, 46, 47)`}
        AND total_wins + total_losses >= (
          CASE
            WHEN CURDATE() > ? THEN 20
            WHEN MONTH(CURDATE()) IN (9, 10, 11) THEN 4
            WHEN MONTH(CURDATE()) IN (12, 1, 2) THEN 8
            WHEN MONTH(CURDATE()) IN (3, 4, 5) THEN 16
            WHEN MONTH(CURDATE()) IN (6, 7) THEN 18
            WHEN MONTH(CURDATE()) = 8 THEN 20
            ELSE 0
          END
        )
    ),
    CTE_RankedFilteredTeams AS (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY division ORDER BY win_percentage DESC) AS result_num
      FROM CTE_FilteredResults
      WHERE division_match = 1
      AND UPPER(level_of_play) = UPPER(?)
    )
    SELECT org_id, team_id, level_of_play, division, full_team_name, org_logo, total_wins, total_losses, win_percentage, ppg, opp_ppg
    FROM CTE_RankedFilteredTeams
    WHERE result_num <= ?
    ORDER BY division DESC, win_percentage DESC;
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
        brand, startDate, endDate, startDate, endDate, level_of_play, division, division, win_loss_percent_cutoff, endDate, level_of_play, max_results_per_division
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

// Export the function
module.exports = publicTeamStanding;