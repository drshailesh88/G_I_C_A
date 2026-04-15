'use client';

import { Mail, Phone } from 'lucide-react';

type EventPerson = {
  id: string;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
};

export function EventPeopleClient({
  eventId,
  people,
}: {
  eventId: string;
  people: EventPerson[];
}) {
  return (
    <div className="space-y-6">
      <h1 role="heading">People</h1>
      <div className="space-y-2">
        {people.length === 0 ? (
          <p className="text-muted-foreground">No people linked to this event yet.</p>
        ) : (
          people.map((person) => (
            <div key={person.id} className="rounded-lg border p-4">
              <p className="font-medium">{person.fullName}</p>
              {person.email && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {person.email}
                </p>
              )}
              {person.phoneE164 && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {person.phoneE164}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
