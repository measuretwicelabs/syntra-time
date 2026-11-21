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
const SCREENS = [['home', 'The timers and the jobs'], ['timed', 'What is being timed'], ['op', 'One operation: its tasks, and starting a timer'], ['maint', 'Maintenance: the machine and the kind of work'], ['after', 'Add time after'], ['timer', 'One timer opened'], ['trip', 'A trip out of the shop'], ['tripstop', 'A trip out: coming back'], ['vehicles', 'Add or remove a vehicle'], ['people', 'Add or remove a person'], ['what', 'What happened and the sign-in']];

/* { id, screen, title, text: [paragraphs] } */
const HELP = [
  { id: 'home-running', screen: 'home', title: 'Running now',
    text: ['Every timer that is open, on this phone or on another phone or tablet, has a row: what is being timed, the job, who is working on it, and how long it has been going. The time moves by itself, with seconds, so you can see it is going.',
      'One timer tracks one task and how long it took. Timers do not care what the others are doing: the same person may be on several, and nothing asks.',
      '"Stop" ends that timer now, with one tap. Time already tapped is never lost: it is kept on the phone first and sent as soon as the phone can. Tap the row itself to open the task: its workers, each with a Pause of their own.'] },
  { id: 'home-pause', screen: 'home', title: 'Pause and Resume',
    text: ['"Pause" stands beside "Stop" on every running timer. Use it for a break, or when the task is put down to do something else. Paused time is not counted.',
      'A paused timer has an amber outline, its time standing still, and when it was paused; "Resume" starts it counting again. It is still open while it is paused, and "Stop" ends it.'] },
  { id: 'home-jobs', screen: 'home', title: 'Picking the job',
    text: ['To time something, pick its job first. The jobs are in the order you used them last, so the job you are on is near the top; "2 running" says how many timers are open on it.',
      'Type in the box to find a job, or type a name that is not on the list and press "New job" to use it. "Shop, no job" is for cleaning, maintenance and other time that belongs to no job.'] },
  { id: 'home-endofday', screen: 'home', title: 'The end-of-day check',
    text: ['The line under the running timers is this phone\'s own end-of-day check: the time it asks "still going?", and a switch, On or Off. "Change" sets the time.',
      'It is for the timers started on this phone; another phone or tablet has its own. Turning it off asks first, because then nothing asks at that time and a forgotten timer runs until midnight asks. You can turn it on again at any time.'] },
  { id: 'home-asked', screen: 'home', title: 'Still going?',
    text: ['At the check time the phone asks about every timer that is still open. A timer with no answer is stopped at that time, so a forgotten timer does not run all night, and it is marked for you to check.',
      '"Still going" lets that timer run on, with the real time. "Stop at 4:00 pm" keeps the stop at the time of the check, not at the minute you tapped. Each timer has its own row; there is no one button for all of them, so a timer is never kept by mistake.',
      'Midnight always asks, whatever the switch. A timer that was paused when the check stopped it closes at the moment it was paused, and its row says so.'] },
  { id: 'home-saved', screen: 'home', title: 'All saved, and records waiting',
    text: ['The top right says "All saved" when everything tapped on this phone has been sent. When there is no signal, or the sign-in has lapsed, it says in amber how many records are waiting on the phone. Press it to see why.'] },
  { id: 'home-notify', screen: 'home', title: 'A notification for each running timer',
    text: ['The first time a timer is started, the page asks once whether to show notifications; if you say yes, the phone asks its own question. After that each open timer has a notification on the phone: what is being timed and the job, how long it has been running, who is on it, and the last check-in. It goes when the timer stops. A paused timer\'s says since when it is paused.',
      '"Check in" on the notification says the work is still going, without opening the page. The timer keeps its last check-in, so a forgotten timer can be put right from it later ("Stop at the last check-in"). A check-in also answers the end-of-day question "still going?".',
      'A page on a phone has limits, and it is better to know them. A notification can be swiped away; it comes back while this page is open. It rings once an hour, and a check-in quiets it for an hour, but only while the phone keeps this page alive: with the page closed, the notification stays as it last was and does not ring. Check in works either way.'] },
  { id: 'home-startup', screen: 'home', title: 'The start-up screen',
    text: ['When the page is opened it shows the family\'s start-up screen for about four seconds, the same as the other programs. Tap it to skip it.'] },
  { id: 'timed-groups', screen: 'timed', title: 'What is being timed',
    text: ['The operations are in groups: in the shop (people), in the shop (machines), and out of the shop. Each one keeps its place on the screen, so your thumb learns where it is.',
      'An operation with a timer open for this job has a green outline and says who. No timer starts on this tap, a machine\'s neither: every operation opens the next screen, where you say who is working and press Start.',
      '"CNC" is one button: its timer keeps the cutting and the loading apart. "Maintenance" asks for the machine and the kind of work first.'] },
  { id: 'op-timers', screen: 'op', title: 'The tasks on this operation',
    text: ['Each timer here is one task, shown as one card: the task\'s time, a line for each worker with their own time, the note, then "Pause the task" and "Stop".',
      '"Correct this timer" at the foot of the card opens it whole, to change who, the job or the times, or to mark it started by mistake.'] },
  { id: 'op-workers', screen: 'op', title: 'Each worker\'s own Pause',
    text: ['Every name on a task has a Pause of its own, for when one worker steps away and the task goes on. It is recorded, and it never changes the task\'s time. A worker who does not come back simply stays recorded as paused.',
      'So a task has three figures: its own time, how many workers, and their combined time, which adds up each worker\'s own time. Two workers together for 8 hours is an 8-hour task, 2 workers, 16 hours combined.'] },
  { id: 'op-add', screen: 'op', title: 'Starting a timer',
    text: ['Pick who is working, one name or more, add a note on what it is if you like, tick "Remake" when it is work being redone, and press Start; the button names who it starts for. It is the same screen for a machine as for a person: the names are part of the record.',
      'The screen comes filled in with the worker picked last time. The Remake tick is there so that time spent redoing work is counted apart, and mistakes do not pass as normal time.'] },
  { id: 'op-second', screen: 'op', title: 'A second timer on the same operation',
    text: ['If a timer is already open on this operation for this job, Start asks what you would like to do: start a second timer beside it, stop the first and start this one, or cancel the first because it was started by mistake. "Not now" changes nothing.',
      'A timer cancelled this way is not deleted: it is kept and listed, and not counted.'] },
  { id: 'op-cnc', screen: 'op', title: 'The CNC',
    text: ['The CNC is one timer, with at least one worker, from Start to Stop. Its two large buttons say what the machine is doing: Cutting, or Loading and unloading (the program, the sheet, labels, unloading, cleaning the bed). A tap on one ends the other; the one running is lit and shows its own time. It starts on Loading and unloading.',
      'Under the buttons are the three totals: the cutting time, with which sheet it is on (each cutting stretch counts as a sheet), the loading time, and the CNC total. On a big job they show how long the machine cut and how long it waited to cut.',
      '"Undo the last switch" takes back a wrong tap, as if it had not been made.'] },
  { id: 'maint-pick', screen: 'maint', title: 'Maintenance',
    text: ['Pick the machine, then the kind of work: Repair, Regular maintenance or Changing tooling. "Next: who is working" goes to the Start screen.',
      'Maintenance is "Shop, no job" unless you picked a job before. The machines are a list kept in SyntraQuote, in Settings, Shop time, Machines. Keeping the machine and the kind with each timer is what keeps the record organised.'] },
  { id: 'after-add', screen: 'after', title: 'Time nobody timed',
    text: ['For work that was done and not timed. Pick the job, what, and who (one name or more); the day (today unless you change it); when it started; and either how long it took or when it stopped. The other is worked out. "How long" can be typed as 2 h 30, 2:30 or 150 minutes.',
      'The time is marked as typed, so it can be told from time that was tapped. A time still to come is refused, and time typed in more than a week afterwards is marked to check. A trip out of the shop is not added here: it is started and stopped as a trip. The CNC and Maintenance are timed live, on their own screens.'] },
  { id: 'timer-open', screen: 'timer', title: 'Opening a timer',
    text: ['Tap a timer on the home screen, or a line in What happened and then "Open this timer", to see it whole: the job, what, who, when it started and stopped and where each time came from (tapped, typed, or by the end-of-day check), and how long it counted.',
      'Anyone at the phone may correct any timer, for now. Nothing is rubbed out: a correction is a new line in the diary, and the first record stays.'] },
  { id: 'timer-check', screen: 'timer', title: 'To check',
    text: ['A timer is marked to check when something is wrong or missing: an end-of-day check stopped it, a reading is missing, the time was typed in a week afterwards, or it ran longer than the long-timer limit. The box says why. "Is right" says you have looked and it stands; the mark goes. A correction that puts the cause right takes it off too.'] },
  { id: 'timer-long', screen: 'timer', title: 'A timer that ran a long time',
    text: ['A timer that was tapped and ran longer than the limit (4 hours of running time, unless it was changed in SyntraQuote) waits to be checked once it has stopped. The check never stops a timer, and a forgotten one is never thrown away by itself.',
      'The box says how long it ran and, when someone checked in, the last check-in: how much of the time was confirmed, and how much came after it. Three answers: the time is right; "Stop at the last check-in", which puts the stop at that moment; or "Delete", which keeps it listed and does not count it.'] },
  { id: 'timer-change', screen: 'timer', title: 'Changing a timer',
    text: ['"Change" on a row opens a small window to pick the new value. Nothing is saved until "Save the changes", so all the changes go in as one correction; "Back" leaves without saving.',
      'A time cannot be in the future, and a stop cannot come before the start: the phone says so and keeps nothing. On a trip the job, what and the note change for the whole trip at once; the vehicle and the odometer are on the driver\'s timer.'] },
  { id: 'timer-mistake', screen: 'timer', title: 'Started by mistake',
    text: ['A timer started by mistake is not deleted: it is kept and shown, and not counted. "Count it again" brings it back. A timer cannot be moved between the shop and out of the shop: mark it started by mistake and start the trip.'] },
  { id: 'trip-people', screen: 'trip', title: 'Who is going, and who is driving',
    text: ['Tap everyone in the vehicle. Each person has a timer of their own, so each one\'s hours stay their own; the kilometres are counted once, for the driver.',
      'Then pick who is driving, one of the people going. A trip of one person needs no driver to be picked. A name already on another timer says where; picking it asks first. Said yes, a timer that person was alone on is stopped when the trip starts; on a task shared with others, that worker is paused on it and the task goes on.'] },
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
  { id: 'what-notify', screen: 'what', title: 'Notifications',
    text: ['The card says whether this phone shows a notification for each open timer. "Off" has a button to turn them on; the phone then asks its own question. "Blocked" means the phone\'s own settings do not allow them for this page: allow them there, then open the page again.',
      'The timers do not need them. They are there so a forgotten timer is noticed.'] },
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
