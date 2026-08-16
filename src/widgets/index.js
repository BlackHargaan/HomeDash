// Resolves a widget `type` to its React component. Kept separate from
// registry.js (metadata) so the context/provider never imports components.
import ClockWidget from './ClockWidget.jsx'
import WeatherWidget from './WeatherWidget.jsx'
import CalendarWidget from './CalendarWidget.jsx'
import TasksWidget from './TasksWidget.jsx'
import NotesWidget from './NotesWidget.jsx'
import LinksWidget from './LinksWidget.jsx'
import HabitsWidget from './HabitsWidget.jsx'
import PomodoroWidget from './PomodoroWidget.jsx'
import StatsWidget from './StatsWidget.jsx'
import EmbedWidget from './EmbedWidget.jsx'
import IframeStatWidget from './IframeStatWidget.jsx'
import TodayWidget from './TodayWidget.jsx'
import CountdownWidget from './CountdownWidget.jsx'
import WorldClockWidget from './WorldClockWidget.jsx'
import KanbanWidget from './KanbanWidget.jsx'

export const WIDGET_COMPONENTS = {
  clock: ClockWidget,
  weather: WeatherWidget,
  calendar: CalendarWidget,
  tasks: TasksWidget,
  notes: NotesWidget,
  links: LinksWidget,
  habits: HabitsWidget,
  pomodoro: PomodoroWidget,
  stats: StatsWidget,
  embed: EmbedWidget,
  iframeStat: IframeStatWidget,
  today: TodayWidget,
  countdown: CountdownWidget,
  worldclock: WorldClockWidget,
  kanban: KanbanWidget,
}
