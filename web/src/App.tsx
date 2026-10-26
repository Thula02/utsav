import { Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import EventPage from "./pages/EventPage";
import Rsvp from "./pages/Rsvp";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/event/:id" element={<EventPage />} />
      <Route path="/rsvp/:token" element={<Rsvp />} />
    </Routes>
  );
}
