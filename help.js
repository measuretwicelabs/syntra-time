/* help.js: the words of the phone page's Help window, kept apart from the screen code so they can be checked in Node (tests/node/timehelp.test.js).
   Rules (CLAUDE.md): every feature has an entry; help never names other software packages and never copies another program's look. Plain words, written for the owner and
   for the people who will tap in the shop. Each entry belongs to one screen; the Help window opens on the entries of the screen being looked at, then lists the others.
   (The same checks as src/helptext.js: this file is in the phone page's own folder so the published copy carries it, and the page cannot read src/.) */
(function (root, factory) {
  const H = factory();
  if (typeof module === 'object' && module.exports) module.exports = H; else root.HELP = H;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* the screens of the phone page, in the order the Help window lists them; a screen is added here when it is built */
const SCREENS = [['home', 'The timers and the jobs'], ['timed', 'What is being timed'], ['op', 'One operation, and who it is for'], ['after', 'Add time after'], ['timer', 'One timer opened'], ['trip', 'A trip out of the shop'], ['tripstop', 'A trip out: coming back'], ['vehicles', 'Add or remove a vehicle'], ['people', 'Add or remove a person'], ['what', 'What happened and the sign-in']];

/* { id, screen, title, text: [paragraphs] } */
const HELP = [
  { id: 'home-running', screen: 'home', title: 'Running now',
    text: ['Every timer that is running, on this phone or on another phone or tablet, has a row: what is being timed, the job, who (or "Machine"), and how long it has been going. The minutes move by themselves.',
      '"Stop" ends that timer now, with one tap. Time already tapped is never lost: it is kept on the phone first and sent as soon as the phone can.'] },
  { id: 'home-jobs', screen: 'home', title: 'Picking the job',
    text: ['To time something, pick its job first. The jobs are in the order you used them last, so the job you are on is near the top; "2 running" says how many timers are running on it.',
      'Type in the box to find a job, or type a name that is not on the list and press "New job" to use it. "Shop, no job" is for cleaning, maintenance and other time that belongs to no job.'] },
  { id: 'home-endofday', screen: 'home', title: 'The end-of-day check',
    text: ['The line under the running timers says when the shop day ends. "Off for today" switches that day\'s check off, for a day you know will run late; it comes back on by itself the next day.'] },
  { id: 'home-asked', screen: 'home', title: 'Still going?',
    text: ['At the end of the shop day the phone asks about every timer that is still running. A timer with no answer is stopped at that time, so nobody is paid for a night, and it is marked for you to check.',
      '"Still going" lets that timer run on. "Stop at 4:00 pm" keeps the stop at the time of the check, not at the minute you tapped. Each timer has its own row; there is no one button for all of them, so a timer is never kept by mistake.',
      '"Off for today: working late" switches the check off for the day; every shop timer runs on, and the check is back tomorrow by itself. Midnight always asks, whatever the switch, so a timer cannot run all night.'] },
  { id: 'home-saved', screen: 'home', title: 'All saved, and records waiting',
    text: ['The top right says "All saved" when everything tapped on this phone has been sent. When there is no signal, or the sign-in has lapsed, it says in amber how many records are waiting on the phone. Press it to see why.'] },
  { id: 'timed-groups', screen: 'timed', title: 'What is being timed',
    text: ['The operations are in groups: in the shop (people), and in the shop (machines). Each one keeps its place on the screen, so your thumb learns where it is.',
      'An operation with a timer running for this job has a green outline and says who. A machine starts at once when you press it, with no name, because a machine is timed apart from people. A person\'s operation opens the next screen, where you say who it is for.'] },
  { id: 'timed-machine-again', screen: 'timed', title: 'A machine that is already running',
    text: ['If you press a machine that already has a timer running, the phone asks first, and says which job it is running for. A second timer on the same machine would count its time twice, so if you start one anyway it is named in SyntraQuote for you to look at.'] },
  { id: 'op-timers', screen: 'op', title: 'The timers on this operation',
    text: ['An operation can have several timers at once, one for each person, side by side. Each card shows the person, how long, and the note. "Stop" ends that one only.'] },
  { id: 'op-add', screen: 'op', title: 'Adding a timer',
    text: ['Pick who it is for (one name for each timer), add a note on what it is if you like, tick "Remake" when it is work being redone, and press "Start". The note and the tick are kept with the timer.',
      'The Remake tick is there so that time spent redoing work is counted apart, and mistakes do not pass as normal hours when the times are learned.'] },
  { id: 'op-busy', screen: 'op', title: 'Someone who is already on a timer',
    text: ['A name already on a timer here is dimmed. A name on another timer says where, in amber. Pressing it asks: "Stop that timer and start this one?" If you say yes, the other timer is stopped and this one is started at the same moment, so nobody is timed twice.'] },
  { id: 'after-add', screen: 'after', title: 'Time nobody timed',
    text: ['For work that was done and not timed. Pick the job, what, and who; the day (today unless you change it); when it started; and either how long it took or when it stopped. The other is worked out. "How long" can be typed as 2 h 30, 2:30 or 150 minutes.',
      'The time is marked as typed, so it can be told from time that was tapped. A time still to come is refused, and time typed in more than a week afterwards is marked to check. A trip out of the shop is not added here: it is started and stopped as a trip.'] },
  { id: 'timer-open', screen: 'timer', title: 'Opening a timer',
    text: ['Tap a timer on the home screen, or a line in What happened and then "Open this timer", to see it whole: the job, what, who, when it started and stopped and where each time came from (tapped, typed, or by the end-of-day check), and how long it counted.',
      'Anyone at the phone may correct any timer, for now. Nothing is rubbed out: a correction is a new line in the diary, and the first record stays.'] },
  { id: 'timer-check', screen: 'timer', title: 'To check',
    text: ['A timer is marked to check when something is wrong or missing: the end-of-day check stopped it, a reading is missing, or the time was typed in a week afterwards. The box says why. "Is right" says you have looked and it stands; the mark goes. A correction that puts the cause right takes it off too.'] },
  { id: 'timer-change', screen: 'timer', title: 'Changing a timer',
    text: ['"Change" on a row opens a small window to pick the new value. Nothing is saved until "Save the changes", so all the changes go in as one correction; "Back" leaves without saving.',
      'A time cannot be in the future, and a stop cannot come before the start: the phone says so and keeps nothing. On a trip the job, what and the note change for the whole trip at once; the vehicle and the odometer are on the driver\'s timer.'] },
  { id: 'timer-mistake', screen: 'timer', title: 'Started by mistake',
    text: ['A timer started by mistake is not deleted: it is kept and shown, and not counted. "Count it again" brings it back. A timer cannot be moved between the shop and out of the shop: mark it started by mistake and start the trip.'] },
  { id: 'trip-people', screen: 'trip', title: 'Who is going, and who is driving',
    text: ['Tap everyone in the vehicle. Each person has a timer of their own, so each one\'s hours stay their own; the kilometres are counted once, for the driver.',
      'Then pick who is driving, one of the people going. A trip of one person needs no driver to be picked. A name already on another timer says where; picking it asks first, and stops that timer when the trip starts.'] },
  { id: 'trip-vehicle', screen: 'trip', title: 'The vehicle and the odometer',
    text: ['Pick a company vehicle, or Own vehicle when someone drives their own. Own vehicle is kept apart for each person, so one person\'s kilometres are never mixed with another\'s.',
      'The odometer leaving may be left empty and filled in later. Under it the phone shows that vehicle\'s last reading, so a wrong number stands out. There is no Remake tick on a trip.'] },
  { id: 'trip-start', screen: 'trip', title: 'Starting the trip',
    text: ['"Start the trip" starts one timer for each person at the same moment, and the phone goes back to the home screen. The trip is stopped from there with Stop, which asks who is back.'] },
  { id: 'tripstop-who', screen: 'tripstop', title: 'Who is back',
    text: ['Stop on a trip asks who is back. Everyone is ticked; untick anyone who is staying out, and their timer runs on and is stopped later with a plain Stop, with no odometer.',
      'How long the trip has been out is at the top.'] },
  { id: 'tripstop-odo', screen: 'tripstop', title: 'The odometer back',
    text: ['Type the odometer back, or leave it empty and fill it in later. Under it the phone shows where the vehicle left and how far it has gone; the distance is counted once, for the driver. A reading lower than the one leaving is refused.',
      'The reading goes with the driver: if the driver is staying out it waits for the driver\'s own Stop.'] },
  { id: 'tripstop-stop', screen: 'tripstop', title: 'Stopping, or not yet',
    text: ['"Stop for" names the people who are stopping now, all at the same moment. "Not yet: keep the trip running" goes back and changes nothing. The note can be changed here, for the whole trip.'] },
  { id: 'vehicles-list', screen: 'vehicles', title: 'Adding and removing a vehicle',
    text: ['A company vehicle added here is on this phone\'s list at once, and is sent with its diary. Removing one only takes it off the list to pick from: trips already recorded keep it. Own vehicle is always offered and is not on this list.'] },
  { id: 'people-add', screen: 'people', title: 'Adding a person',
    text: ['Type the name and press "Add". It is on the list to pick from at once, on this phone. A name that is already there is not added twice.',
      'The names SyntraQuote keeps are on every phone; a name added here is on this phone and is sent with its diary, so SyntraQuote sees who it is.'] },
  { id: 'people-remove', screen: 'people', title: 'Removing a person',
    text: ['"Remove" only takes the name off the list to pick from. Time already recorded keeps the name, and a timer that is running carries on to its end. A name on a timer now says so.'] },
  { id: 'what-signin', screen: 'what', title: 'The sign-in',
    text: ['Every record the phone saves names who made it, so the phone is signed in once, with the shop\'s sign-in. The first card shows whether it is signed in and as whom.',
      'The sign-in lasts about a day. When it runs out the phone tries again by itself when the page is opened, and nothing is typed. If it needs a tap, the card says "Not signed in" and a button signs in again.',
      'Timers work with or without the sign-in. Every tap is kept on the phone first and sent when the phone is signed in and has signal, so a lapsed sign-in can delay a record but never loses one.'] },
  { id: 'what-saved', screen: 'what', title: 'Saved, and records waiting',
    text: ['The second card says whether everything tapped on this phone has been sent. "All saved" means nothing is waiting. When there is no signal, or the sign-in has lapsed, it says how many records are kept on the phone; they are sent by themselves as soon as they can be, and the count on the first screen goes back to "All saved".',
      'The line under it is the folder the records are saved into.'] },
  { id: 'what-log', screen: 'what', title: 'The list of what happened',
    text: ['The list is in plain words, newest first, with the time each line happened in the shop\'s clock: what was started and stopped, when the phone saved, when it lost and found the signal, when the lists from SyntraQuote were read.',
      'Press a line to see its detail (the record numbers or the reason a message gave). A line in amber is something out of the ordinary: a missing signal, a refused save, a file that could not be read. Nothing in amber has lost a record.'] },
  { id: 'what-earlier', screen: 'what', title: 'Earlier days',
    text: ['"Earlier days" shows the lines of the days before today, each day under its own heading. "Back to today" returns. The list is kept on this phone only.'] },
  { id: 'what-signout', screen: 'what', title: 'Sign out on this phone',
    text: ['"Sign out on this phone" asks first. It takes the sign-in off this phone only; nothing already tapped is lost, because the records are kept on the phone and wait for the next sign-in.',
      'Use it when the phone changes hands. The shop tablet should keep its sign-in and stay in the shop with its screen locked.'] }
];

const forScreen = (screen) => HELP.filter((h) => h.screen === screen);
/* names of other software that help must never use (CLAUDE.md); the test reads every entry for them */
const BANNED = ['mozaik', 'aspire', 'vcarve', 'cabinet vision', 'cabinetvision', 'autocad', 'sketchup', 'fusion', 'excel', 'microsoft', 'onedrive', 'google', 'chrome', 'edge', 'photoshop', 'solidworks', 'revit', 'bluebeam', 'syntracad', 'syntracnc', 'linework'];
const badWords = (h) => { const t = (h.title + ' ' + h.text.join(' ')).toLowerCase(); return BANNED.filter((b) => new RegExp('\\b' + b + '\\b').test(t)); };

return { SCREENS, HELP, forScreen, BANNED, badWords };
});
