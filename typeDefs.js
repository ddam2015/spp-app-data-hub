const { gql } = require('apollo-server-express');

const typeDefs = gql`
  scalar DateTime
  scalar JSON
  scalar Decimal
  scalar Float

  type Query {
    hello: String
    welcome: String
    eventById(id: ID!): Event
  }

  type CompressedData {
    data: String
  }

  type Event {
    id: ID
    name: String
    short_name: String
    dates: DateTime
    logo_img: String
    link: String
    eventtime: DateTime
    updatetime: DateTime
    account_level: Int
    enabled: Int
    org: Int
    type: Int
    hashtag: String
    description: String
    times: String
    divisions: JSON
    locations: String
    short_locations: String
    social: JSON
    video: String
    schedule_link: JSON
    stats: JSON
    trends: JSON
    contact_name: String
    email: String
    phone: String
    nickname: String
  }

  type Player {
    id: ID
    createtime:	DateTime
    updatetime:	DateTime
    account_level: Int
    enabled:	Int
    first_name: String
    last_name: String
    email: String
    phone: String
    profile_img: String
    address: String
    city: String
    state: String
    zip: String
    country: String
    birthday:	DateTime
    verified:	Int
    tagline: String
    grad_year:	Int
    height_ft:	Int
    height_in:	Int
    weight:	Int
    position:	Int
    social:	JSON
    videos:	JSON
    notes:	JSON
    club_team:	Int
    school: String
    gpa:	Decimal
    sat:	Int
    act:	Int
    nickname: String
    access:	JSON
    name: String
    attendant:	JSON
  }

  type TeamStanding {
    org_id: Int
    team_id: Int
    level_of_play: String
    division: Int
    full_team_name: String
    org_logo: String
    total_wins: Int
    total_losses: Int
    win_percentage: Float
    ppg: Float
    opp_ppg: Float
  }

  type TeamStandingGameResult {
    team_id: Int
    event_id: Int
    game_id: Int
    event_name: String
    org: Int
    roster_id: Int
    score: Int
    opp_org_id: Int
    opp_roster_id: Int
    opp_score: Int
    outcome: String
    level: Int
    full_team_name: String
    org_logo: String
    opp_full_team_name: String
    opp_org_logo: String
  }

  type BoxScore {
    box_score: JSON
  }

  type BrandList {
    id: Int
    nickname: String
  }
  
  type LevelDivision {
    lv_dv: JSON
  }

  type Mutation {
    eventSearch(condition: String!): [Event]
    eventPublic(condition: String!): [Event]
    publicTeamStanding(
      brand: Int!, 
      select_year: String!, 
      level_of_play: String!, 
      division: String!, 
      win_loss_percent_cutoff: Float!, 
      show_girls: Boolean!, 
      max_results_per_division: Int!
    ): [TeamStanding]
    publicTeamStandingGameResult(
      brand: Int!, 
      select_year: String!, 
      teamOrg: Int!, 
      teamId: Int!, 
    ): [TeamStandingGameResult]
    publicBoxScore(
      teamId: Int!,
      selectYear: String!, 
      gameId: Int!,
      maxResultsPerDivision: Int!,
    ): [BoxScore]
    publicBrandList(
      brandNickname: String!,
    ): [BrandList]
    publicTSLevelDivision(
      brand: Int!,
    ): [LevelDivision]
    signIn(idToken: String!): String
    eventCalendar(condition: String!): [Event]
    playerDirectory(condition: String!): CompressedData
    organizationDirectory(condition: String!): CompressedData
  }
`;

module.exports = typeDefs;