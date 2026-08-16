export const LIVETICKER_DATA = [
  {
    gameId: 1,
    status: '1. Halbzeit',
    standing: 'Gruppe 1',
    time: '2026-08-15T11:30:00+00:00',
    home: {
      name: 'Baltic Blue Stars Rostock',
      score: '12',
      isInPossession: true,
    },
    away: {
      name: 'Munich Mules',
      score: '0',
      isInPossession: false,
    },
    ticks: [
      {text: 'Turnover', team: 'home', time: '2026-08-15T12:05:00+00:00'},
      {text: 'Touchdown: #19 Extra-Punkt: #7', team: 'home', time: '2026-08-15T12:10:00+00:00'},
      {text: 'Auszeit - 12:00', team: 'away', time: '2026-08-15T12:12:00+00:00'},
      {text: 'Safety: #12', team: 'home', time: '2026-08-15T13:10:00+00:00'},
      {text: 'Touchdown: #7 Extra-Punkt: -', team: 'away', time: '2026-08-15T13:20:00+00:00'},
    ],
  },
  {
    gameId: 2,
    status: '2. Halbzeit',
    standing: 'P1',
    time: '2026-08-15T12:30:00+00:00',
    home: {
      name: 'Munich Mules',
      img: 'https://dffl.flag-coaching.info/dffl/wp-content/uploads/2018/03/Logo-Munich-Mules.png',
      score: '0',
      isInPossession: false,
    },
    away: {
      name: 'Team Deutschland',
      img: 'https://dffl.flag-coaching.info/dffl/wp-content/uploads/2018/02/TD-FlagFootball-Logo-Kopie.png',
      score: '12',
      isInPossession: true,
    },
    ticks: [
      {text: 'Turnover [12:00]', team: 'away', time: '2026-08-15T13:00:00+00:00'},
      {text: 'Touchdown: #19 Extra-Punkt: #7', team: 'home', time: '2026-08-15T13:05:00+00:00'},
      {text: 'Auszeit - 12:00', team: 'home', time: '2026-08-15T13:30:00+00:00'},
      {text: 'Safety: #12', team: 'home', time: '2026-08-15T13:31:00+00:00'},
      {text: 'Touchdown: #7 Extra-Punkt: -', team: 'away', time: '2026-08-15T13:59:00+00:00'},
    ],
  },
];
