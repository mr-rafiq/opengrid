import type { Column } from "@opengrid/core";

export interface Participant {
  id: string;
  record: number;
  name: string;
  language: string;
  country: string;
  game: string;
  bought: boolean;
  balance: number;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  winRate: number;
  score: number;
  kills: number;
  deaths: number;
  assists: number;
  age: number;
  joined: string;
  sessionMinutes: number;
  lastActive: string;
  online: boolean;
}
export const countries = [
  "United Kingdom",
  "France",
  "Germany",
  "Japan",
  "Brazil",
  "India",
] as const;
const languages = [
  "English",
  "French",
  "German",
  "Japanese",
  "Portuguese",
  "Hindi",
];
const first = [
  "Avery",
  "Camille",
  "Luca",
  "Hana",
  "Rafael",
  "Mira",
  "Theo",
  "Amara",
  "Noah",
  "Yuki",
  "Isha",
  "Leo",
  "Sofia",
];
const last = [
  "Morgan",
  "Laurent",
  "Weber",
  "Tanaka",
  "Costa",
  "Shah",
  "Clarke",
  "Diallo",
  "Bennett",
  "Sato",
  "Patel",
];
const games = [
  "Starfall Rally",
  "Garden Quest",
  "Orbit Arena",
  "Summit Tactics",
  "Coral City",
  "Moonlight Run",
  "Paper Kingdom",
];
/** Deterministic fictional records. No network requests or personal data. */
export function createParticipants(count: number): Participant[] {
  if (![1000, 10000, 100000].includes(count))
    throw new RangeError("Use 1,000, 10,000 or 100,000 records");
  return Array.from({ length: count }, (_, index) => {
    const seed = Math.imul(index + 1, 2654435761) >>> 0;
    const country = index % countries.length;
    const wins = seed % 280,
      losses = (seed >>> 8) % 120,
      draws = (seed >>> 16) % 20;
    const matches = wins + losses + draws;
    return {
      id: `participant-${index + 1}`,
      record: index + 1,
      name: `${first[index % first.length]} ${last[Math.floor(index / first.length) % last.length]}`,
      language: languages[country],
      country: countries[country],
      game: games[index % games.length],
      bought: seed % 3 !== 0,
      balance: Math.round((seed % 8000000) / 100),
      rating: 1 + (seed % 5),
      wins,
      losses,
      draws,
      matches,
      winRate: matches ? Math.round((wins / matches) * 1000) / 10 : 0,
      score: seed % 150000,
      kills: seed % 2000,
      deaths: (seed >>> 4) % 1200,
      assists: (seed >>> 10) % 900,
      age: 18 + (seed % 48),
      joined: `202${seed % 5}-0${1 + (seed % 9)}-${String(1 + (seed % 28)).padStart(2, "0")}`,
      sessionMinutes: 10 + (seed % 170),
      lastActive: `2026-10-${String(1 + (seed % 28)).padStart(2, "0")}`,
      online: seed % 4 === 0,
    };
  });
}
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const numeric = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const formatNumber = (value: unknown) =>
  value == null
    ? ""
    : numeric.format(typeof value === "bigint" ? value : Number(value));
const formatInteger = (value: unknown) =>
  value == null
    ? ""
    : integer.format(typeof value === "bigint" ? value : Number(value));
const formatMoney = (value: unknown) =>
  value == null
    ? ""
    : money.format(typeof value === "bigint" ? value : Number(value));
const formatPercent = (value: unknown) =>
  value == null ? "" : `${Number(value).toFixed(1)}%`;
export function participantColumns(): Column<Participant>[] {
  const metric = (
    id: keyof Participant & string,
    header: string,
    aggregate: "sum" | "avg" = "sum",
  ): Column<Participant> => ({
    id,
    field: id,
    header,
    width: 125,
    type: "number",
    groupPath: ["Statistics"],
    aggregate,
    valueFormatter: formatNumber,
    aggregateFormatter: (value, context) =>
      context.aggregate === "count"
        ? formatInteger(value)
        : formatNumber(value),
    groupable: false,
  });
  return [
    {
      id: "record",
      field: "record",
      header: "Record",
      groupPath: ["Records"],
      width: 95,
      type: "number",
      groupable: false,
      filterable: false,
      valueFormatter: formatInteger,
      aggregateFormatter: formatInteger,
    },
    {
      id: "name",
      field: "name",
      header: "Name",
      width: 200,
      groupPath: ["Participant"],
      editable: true,
    },
    {
      id: "language",
      field: "language",
      header: "Language",
      width: 145,
      groupPath: ["Participant"],
    },
    {
      id: "country",
      field: "country",
      header: "Country",
      width: 195,
      groupPath: ["Participant"],
    },
    {
      id: "game",
      field: "game",
      header: "Game name",
      width: 180,
      groupPath: ["Game of choice"],
    },
    {
      id: "bought",
      field: "bought",
      header: "Bought",
      width: 115,
      type: "boolean",
      editable: true,
      groupPath: ["Game of choice"],
    },
    {
      id: "balance",
      field: "balance",
      header: "Bank balance",
      width: 175,
      type: "number",
      aggregate: "sum",
      groupable: false,
      groupPath: ["Performance"],
      valueFormatter: formatMoney,
      aggregateFormatter: (value, context) =>
        context.aggregate === "count"
          ? formatInteger(value)
          : formatMoney(value),
    },
    {
      id: "rating",
      field: "rating",
      header: "Rating",
      width: 155,
      type: "number",
      aggregate: "avg",
      groupPath: ["Performance"],
      groupable: false,
      aggregateFormatter: (value, context) =>
        context.aggregate === "count"
          ? formatInteger(value)
          : formatNumber(value),
    },
    metric("wins", "Wins"),
    metric("losses", "Losses"),
    metric("draws", "Draws"),
    metric("matches", "Matches"),
    {
      ...metric("winRate", "Win rate", "avg"),
      valueFormatter: formatPercent,
      aggregateFormatter: (value, context) =>
        context.aggregate === "count"
          ? formatInteger(value)
          : formatPercent(value),
    },
    metric("score", "Score"),
    metric("kills", "Kills"),
    metric("deaths", "Deaths"),
    metric("assists", "Assists"),
    {
      ...metric("age", "Age", "avg"),
      groupPath: ["Activity"],
      aggregate: undefined,
    },
    {
      id: "joined",
      field: "joined",
      header: "Joined",
      width: 145,
      type: "date",
      groupPath: ["Activity"],
      groupable: false,
    },
    {
      ...metric("sessionMinutes", "Session (min)", "avg"),
      groupPath: ["Activity"],
    },
    {
      id: "lastActive",
      field: "lastActive",
      header: "Last active",
      width: 145,
      type: "date",
      groupPath: ["Activity"],
      groupable: false,
    },
    {
      id: "online",
      field: "online",
      header: "Online",
      width: 115,
      type: "boolean",
      groupPath: ["Activity"],
    },
  ];
}
