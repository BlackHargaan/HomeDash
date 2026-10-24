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
import StatusWidget from './StatusWidget.jsx'
import DockerWidget from './DockerWidget.jsx'
import RssWidget from './RssWidget.jsx'
import SearchWidget from './SearchWidget.jsx'
import CalculatorWidget from './CalculatorWidget.jsx'
import BookmarksWidget from './BookmarksWidget.jsx'
import NotebookWidget from './NotebookWidget.jsx'
import QuoteWidget from './QuoteWidget.jsx'
import BoostWidget from './BoostWidget.jsx'
import GitHubWidget from './GitHubWidget.jsx'
import AssistantWidget from './AssistantWidget.jsx'

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
  status: StatusWidget,
  docker: DockerWidget,
  rss: RssWidget,
  search: SearchWidget,
  calculator: CalculatorWidget,
  bookmarks: BookmarksWidget,
  notebook: NotebookWidget,
  quote: QuoteWidget,
  boost: BoostWidget,
  github: GitHubWidget,
  assistant: AssistantWidget,
}
