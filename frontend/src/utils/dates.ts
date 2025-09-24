import { DateTime } from "luxon";

export const formatISOUTCDateToString = (eventDate: string | Date) => {
  try {
    let dateTime: DateTime;
    if (typeof eventDate === "string") {
      dateTime = DateTime.fromISO(eventDate, { zone: "utc" });
    } else {
      dateTime = DateTime.fromJSDate(eventDate, { zone: "utc" });
    }
    return dateTime.toFormat("dd/MM/yyyy");
  } catch (error) {
    console.error("Error formatting date:", error);
    return eventDate.toString();
  }
};
