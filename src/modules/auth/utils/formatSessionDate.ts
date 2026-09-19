/** The device's own locale and time zone: an "was that me?" answer reads in the user's clock. */
export const formatSessionDate = (isoDate: string): string => new Date(isoDate).toLocaleString();
