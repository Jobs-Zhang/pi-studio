import "./components/PiStudioApp";
import { activePiStudioLocale } from "./i18n";

// Tag the document before the app element renders so CSS and assistive
// technology see the same locale as the catalogs.
document.documentElement.lang = activePiStudioLocale();
