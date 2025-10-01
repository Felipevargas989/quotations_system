import { useState, useEffect } from "react";
import { checkConflictsWithExistingQuotations } from "../services/quotations.service";

interface UseDateAvailabilityReturn {
  hasConflicts: boolean;
  isChecking: boolean;
}

export const useDateAvailability = (
  eventDate: string | Date | null | undefined,
): UseDateAvailabilityReturn => {
  const [hasConflicts, setHasConflicts] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    const checkConflicts = async () => {
      // Convert Date to string if needed
      let dateString: string | null = null;

      if (eventDate instanceof Date) {
        dateString = eventDate.toISOString().split("T")[0];
      } else if (typeof eventDate === "string") {
        dateString = eventDate;
      }

      if (dateString) {
        setIsChecking(true);
        try {
          const { data } =
            await checkConflictsWithExistingQuotations(dateString);
          setHasConflicts(data?.has_conflicts || false);
        } catch (error) {
          setHasConflicts(false);
        } finally {
          setIsChecking(false);
        }
      } else {
        setHasConflicts(false);
        setIsChecking(false);
      }
    };

    checkConflicts();
  }, [eventDate]);

  return { hasConflicts, isChecking };
};
