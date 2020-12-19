// ---------- IMPORTS ----------

// commander --> handles CLI arguments entered before runtime
const { Command } = require('commander');

// stdin --> reads input from terminal during runtime
const stdin = process.stdin;

// chalk --> displays color and styles in the terminal
const chalk = require('chalk');

// cli-progress --> progress bar to display timer status
const cliProgress = require('cli-progress');



// ---------- GLOBAL CONSTANTS ----------

// Custom defined terminal output styles
const STYLES = {
  DEBUG:          chalk.bold.red.underline,
  PROGRESS_BAR:   chalk.bold.blue,
  STATUS_BAR:     chalk.bold.grey,
  HINT:           chalk.bold.grey,
  PHASE:          chalk.bold.white,
  FOCUS:          chalk.bold.blue,
  SHORT_BREAK:    chalk.bold.green,
  LONG_BREAK:     chalk.bold.magenta,      
}

// Enum for phase types
const PHASE_TYPE = {
  FOCUS:         "Focus",
  SHORT_BREAK:   "Short Break",
  LONG_BREAK:    "Long Break",
}

// Progress bar settings 
// FORMAT --> String format
// SIZE --> Progress bar width (default: 40)
const PROGRESS_BAR = {
  FORMAT:   "{status} {barBorder} " + STYLES.PROGRESS_BAR("{bar}") + " {barBorder} {timeRemaining} {phaseType}",
  SIZE:     30,
}

// Enum for session status types with status messages
const STATUS = {
  ONGOING:    "In Session",
  PAUSED:     "Paused",
  SKIPPED:    "Skipped",
  COMPLETE:   "Pomodoro Session Complete!",
}

// Timer index to start Pomodoro session on
const START_TIMER_INDEX = 0;



// ---------- GLOBAL VARIABLES ----------

// Input variables from the CLI to be collected
let focusDuration, shortBreakDuration, longBreakDuration, phasesTotal;

// phaseInfo --> Processed phase type and duration
let phaseInfo;

// multibar --> Progress bars setting
// progressBars --> Array of progress bars
// statusbar --> Display Play/Pause state as a progress bar
let multibar, progressBars, statusBar;

// statusCode --> Stores the status type of the session (Enum STATUS)
let statusCode;



// ---------- GLOBAL HELPER FUNCTIONS ----------

// Helper function to format phase duration as a string of "mins:seconds"
const formattedDuration = (seconds) => {
  const minutesString = Math.trunc(seconds / 60).toString().padStart(2, '0');
  const secondsString = (seconds % 60).toString().padStart(2, '0');
  return minutesString + ":" + secondsString;
}

// Helper function to update statusbar status (Enum STATUS input)
const updateStatus = (statusType, showStatusDelay = 0) => {
  // Delay the status bar update if delay was specified
  setTimeout(() => {
    statusBar.update({status: STYLES.STATUS_BAR(`STATUS: \u25B6 ${statusType}`)});
  }, showStatusDelay);
  // Set status code
  statusCode = statusType;
}

// Helper function to be called on Pomodoro session complete
const sessionCompleteCallback = () => {
  updateStatus(STYLES.PROGRESS_BAR(STATUS.COMPLETE));
} 



// ---------- CLI SETUP ----------

const program = new Command();

program
  .option('-f, --focus <int>', 'Focus phase minutes', 25)
  .option('-s, --short-break <int>', 'Short Break phase minutes', 5)
  .option('-l, --long-break <int>', 'Long Break phase minutes', 15)
  .option('-r, --rounds <int>', 'How many Focus rounds', 4)
  .option('-d, --debug', '--- Output debugging code ---')

program.parse(process.argv);



// ---------- CLI INPUT PROCESSING ----------

// --- Debug option output --- 
// program.opts() --> all parsed argument values
// program.args --> all unparsed argument values
if (program.debug) {
  console.log(STYLES.DEBUG("Parsed arguments:"), program.opts());
  console.log(STYLES.DEBUG("Unparsed arguments:"), program.args);
};

// Parse Input to global variables
focusDuration = parseInt(program.focus);
shortBreakDuration = parseInt(program.shortBreak);
longBreakDuration = parseInt(program.longBreak);
phasesTotal = parseInt(program.rounds) * 2;



// ---------- PHASE INFO PROCESSING ----------

// Process phase types (enum PHASE_TYPE) and durations (int minutes)
phaseInfo = [];

// Populate phaseInfo
for (let i=1; i < phasesTotal; i++) {
  // Phase type and duration change depending on phase number (phase begins at 1)
  let phaseType, phaseDuration;

  // Every odd phase is a focus phase, and every even phase (except final) is a short break phase
  if (i % 2 === 0) {
    phaseType = PHASE_TYPE.SHORT_BREAK;
    phaseDuration = shortBreakDuration;
  } else {
    phaseType = PHASE_TYPE.FOCUS;
    phaseDuration = focusDuration;
  }

  // This array should have all Focus and Short Break phase durations by loop completion
  phaseInfo.push([phaseType, phaseDuration]);
}

// Add the final Long Break phase duration to the array
phaseInfo.push([PHASE_TYPE.LONG_BREAK, longBreakDuration]);



// ---------- PROGRESSBAR SETTINGS ----------

// Setup multi progress bar container
multibar = new cliProgress.MultiBar({
  format: PROGRESS_BAR.FORMAT,
  barsize: PROGRESS_BAR.SIZE,
  // barCompleteChar: '\u2588',
  // barIncompleteChar: '\u2591',
  // barGlue: "",
  stopOnComplete: true,
  hideCursor: true,
}, cliProgress.Presets.rect);



// ---------- PROGRESSBAR INITIALIZATION ----------

// Initialize progress bars
progressBars = [];

// Populate progressBars with progress bars for each phase
phaseInfo.forEach((phaseElement, phaseIndex) => {
  // Get phase type and duration from the phaseInfo element
  const phaseType = phaseElement[0];
  const phaseDurationSeconds = phaseElement[1] * 60;

  // phaseName --> string: Focus, Short Break, Long Break
  let phaseName;

  // outputStyle --> Change output style according to current phase
  let outputStyle;

  // Set output style according to the phase type
  if (phaseType === PHASE_TYPE.LONG_BREAK) {
    outputStyle = STYLES.LONG_BREAK;
  } else if (phaseType === PHASE_TYPE.SHORT_BREAK) {
    outputStyle = STYLES.SHORT_BREAK;
  } else {
    outputStyle = STYLES.FOCUS;
  }

  // Instantiate new single progress bar with initial payload
  const b = multibar.create(phaseDurationSeconds, 0, {
    status: `Phase ${phaseIndex + 1}/${phasesTotal}`.padStart(11, ' '),
    barBorder: "|",
    timeRemaining: formattedDuration(phaseDurationSeconds),
    phaseType: outputStyle(phaseType.padEnd(11, ' ')),
  });

  // Push the progress bar to the global array of progress bars
  progressBars.push(b);
});



// ---------- STATUSBAR INITIALIZATION ----------

// Create the status bar (Should be displayed below the timers)
statusBar = multibar.create(1, 0, {
  status: STYLES.STATUS_BAR("STATUS: \u25B6 In Session"),
  barBorder: "",
  timeRemaining: "",
  phaseType: "",
});



// ---------- POMODORO START SESSION ----------

// This function recursively calls the next timer until all timers are complete
const startNextTimer = (index, callback) => {
  // If there are no timers remaining, call the callback function
  if (index >= phasesTotal) {
    callback();
  } else {
    // Logic for progressing the progress bars one after another

    // Decrementing variable t represents timer countdown in seconds
    let t = parseInt(phaseInfo[index][1]) * 60;

    // Reference to the current progress bar
    const timer = progressBars[index];

    // Helper function to handle setInterval cleanup and startNextTimer within perSecondUpdate
    const timerCleanup = () => {
      clearInterval(perSecondUpdate);
      startNextTimer(index + 1, callback);
    }

    // Update the current progress bar every second until completion
    const perSecondUpdate = setInterval(() => {
      // If the current timer was skipped, start the next timer on next second cycle
      // (Show "Skipped" status for at least 300ms if there are more timers to run)
      if (statusCode === STATUS.SKIPPED) {
        timerCleanup();
        if (index + 1 < phasesTotal) {updateStatus(STATUS.ONGOING, 300)}
      }
      // If the current timer is ongoing, update or clear the timer
      else if (statusCode === STATUS.ONGOING) {
        // While the seconds countdown is not complete, progress the progress bar
        if (t > 0) {
          timer.increment({timeRemaining: formattedDuration(--t)});
        } else {
          // When the timer is complete, clear the setInterval and startNextTimer
          timerCleanup(stopTimer = true);
        }
      }
    }, 1000);
  }
}

// Display the controls as a hint
console.log(STYLES.HINT("Pomodoro - Press <p> to play/pause | <s> to skip | <Ctrl-C> to exit"));

// Begin the Pomodoro session and pass in the session complete callback
startNextTimer(START_TIMER_INDEX, () => {sessionCompleteCallback()});
statusCode = STATUS.ONGOING;



// ---------- STDIN SETUP ----------

// Get inputs after starting program from CLI
stdin.setRawMode( true );

// Begin reading from stdin so the process does not exit
stdin.resume();

// Read input in utf8 instead of binary
stdin.setEncoding( 'utf8' );



// ---------- STDIN INPUT PROCESSING ----------

// Listener for any data input in the terminal
stdin.on('data', (key) => {

  // DEBUG: Display input key to the user
  // console.log();
  // console.log("Input Key:", key);

  // Input: <Ctrl-C> (END OF TEXT signal) --> process.exit()
  if ( key === '\u0003' ) {
    console.log();
    console.log(STYLES.DEBUG("Program exited"));
    process.exit();
  }

  // Input: <p> --> Play/Pause Pomodoro timer
  else if ( key === 'p' ) {
    // Pause of play the timers depending on the current status of the Pomodoro session
    if (statusCode === STATUS.ONGOING) {
      // Pause
      updateStatus(STATUS.PAUSED);
    } else if (statusCode === STATUS.PAUSED) {
      // Play
      updateStatus(STATUS.ONGOING);
    }
  }

  // Input: <s> --> Skip the current timer
  else if ( key === 's' ) {
    // Do not change status to "Skipped" if the Pomodoro session is complete
    if (statusCode !== STATUS.COMPLETE) {
      updateStatus(STATUS.SKIPPED);
    }
  }
});
