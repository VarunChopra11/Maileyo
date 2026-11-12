import { useEffect, useCallback, useState, useRef } from "react";
import { Loader2, Menu } from "lucide-react";
import { EmailContact, SidebarFolder } from "@/types/email";
import { emailService } from "@/services/emailService";
import { toast } from "sonner";
import { useCompose } from "@/context/ComposeContext";
import MobileFolderDrawer from "./MobileFolderDrawer";
import { fetchAuthenticatedUser } from "../../lib/auth";

interface EmailHeader {
  name: string;
  value: string;
}

interface ContactListProps {
  selectedFolder: SidebarFolder;
  selectedContact: EmailContact | null;
  contacts: EmailContact[];
  loading: boolean;
  pageToken: string;
  onContactSelect: (contact: EmailContact) => void;
  onContactsUpdate: (contacts: EmailContact[], pageToken: string) => void;
  onLoadingChange: (loading: boolean) => void;
  onFolderSelect?: (folder: SidebarFolder) => void;
  onCompose?: () => void;
  onOpenDrawer?: () => void;
}

interface AuthenticatedUser {
  email: string;
  name: string;
  picture: string;
  google_id: string;
}

const decodeHtmlEntities = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
};

function ContactList({
  selectedFolder,
  selectedContact,
  contacts,
  loading,
  pageToken,
  onContactSelect,
  onContactsUpdate,
  onLoadingChange,
  onFolderSelect,
  onCompose,
  onOpenDrawer,
}: ContactListProps) {
  const composeContext = useCompose();
  const handleCompose = onCompose || composeContext?.openCompose;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const user = await fetchAuthenticatedUser();
      setCurrentUser(user);
    };
    loadUser();
  }, []);

  const extractContactInfo = (headers: EmailHeader[] | undefined, userEmail?: string) => {
    if (!headers) return { contactName: "Unknown", contactEmail: "" };

    const fromHeader = headers.find((h) => h.name === "From")?.value || "";
    const toHeader = headers.find((h) => h.name === "To")?.value || "";

    let targetHeader = fromHeader;
    if (userEmail && fromHeader.includes(userEmail)) {
      targetHeader = toHeader;
    }

    if (!targetHeader) return { contactName: "Unknown", contactEmail: "" };

    const nameMatch = targetHeader.match(/^(.+?)\s*<.+>$/);
    let contactName = "Unknown";
    let contactEmail = "";

    if (nameMatch) {
      contactName = nameMatch[1].replace(/"/g, "").trim();
      const emailMatch = targetHeader.match(/<(.+)>/);
      contactEmail = emailMatch ? emailMatch[1] : "";
    } else {
      contactEmail = targetHeader;
      if (contactEmail.includes("@")) {
        contactName = contactEmail.split("@")[0];
      } else {
        contactName = targetHeader;
      }
    }

    return {
      contactName: decodeHtmlEntities(contactName),
      contactEmail: contactEmail.trim(),
    };
  };

  const fetchContacts = useCallback(
    async (folder: SidebarFolder, loadMore = false) => {
      try {
        onLoadingChange(true);

        const currentPageToken = loadMore ? pageToken : "";

        if (loadMore && !currentPageToken) {
          onLoadingChange(false);
          return;
        }

        const response = await emailService.fetchEmails(folder, 20, currentPageToken);
        const emailsArray = response.emails || [];

        const contactMap = new Map<string, EmailContact>();

        if (loadMore) {
          for (const c of contacts) {
            contactMap.set(c.email.toLowerCase().trim(), { ...c });
          }
        }

        for (const email of emailsArray) {
          const { contactName, contactEmail } = extractContactInfo(
            email.payload?.headers,
            currentUser?.email
          );
          if (!contactEmail) continue;

          const emailKey = contactEmail.toLowerCase().trim();
          const emailTimestamp = new Date(Number(email.internalDate)).toISOString();
          const isUnread = Boolean(email.labelIds && email.labelIds.includes("UNREAD"));
          const rawSnippet = email.snippet || "";
          const snippet = decodeHtmlEntities(rawSnippet);
          const labels = email.labelIds || [];

          const existing = contactMap.get(emailKey);
          if (existing) {
            const isNewer =
              new Date(emailTimestamp).getTime() > new Date(existing.timestamp).getTime();
            const combinedLabels = Array.from(new Set([...existing.labels, ...labels]));
            const newUnreadCount = (existing.unreadCount || 0) + (isUnread ? 1 : 0);

            contactMap.set(emailKey, {
              ...existing,
              id: isNewer ? email.id : existing.id,
              name:
                existing.name === "Unknown" || !existing.name
                  ? contactName
                  : existing.name,
              lastMessage: isNewer ? snippet : existing.lastMessage,
              snippet: isNewer ? snippet : existing.snippet,
              timestamp: isNewer ? emailTimestamp : existing.timestamp,
              labels: combinedLabels,
              unread: existing.unread || isUnread,
              unreadCount: newUnreadCount,
            });
          } else {
            contactMap.set(emailKey, {
              id: email.id,
              name: contactName || contactEmail.split("@")[0],
              email: contactEmail,
              lastMessage: snippet,
              snippet: snippet,
              timestamp: emailTimestamp,
              labels: labels,
              unread: isUnread,
              unreadCount: isUnread ? 1 : 0,
            });
          }
        }

        const deduplicatedContacts = Array.from(contactMap.values()).sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        onContactsUpdate(deduplicatedContacts, response.next_page_token || "");
      } catch (error) {
        console.error("Failed to fetch contacts:", error);
        toast.error("Failed to load contacts");
      } finally {
        onLoadingChange(false);
      }
    },
    [contacts, pageToken, onContactsUpdate, onLoadingChange, currentUser?.email]
  );

  const markAsRead = useCallback(
    (emailId: string) => {
      const updatedContacts = contacts.map((contact) => {
        if (contact.id === emailId) {
          return {
            ...contact,
            labels: contact.labels.filter((label) => label !== "UNREAD"),
            unread: false,
            unreadCount: 0,
          };
        }
        return contact;
      });

      onContactsUpdate(updatedContacts, pageToken);
    },
    [contacts, pageToken, onContactsUpdate]
  );

  const handleContactSelect = useCallback(
    (contact: EmailContact) => {
      if (contact.unread) {
        markAsRead(contact.id);
      }
      onContactSelect(contact);
    },
    [markAsRead, onContactSelect]
  );

  useEffect(() => {
    if (currentUser) {
      fetchContacts(selectedFolder);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolder, currentUser]);

  useEffect(() => {
    if (loading || !pageToken) return;

    if (observer.current) {
      observer.current.disconnect();
    }

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && pageToken && !loading) {
        fetchContacts(selectedFolder, true);
      }
    };

    observer.current = new IntersectionObserver(observerCallback, {
      root: null,
      rootMargin: "20px",
      threshold: 0.1,
    });

    if (loadMoreRef.current) {
      observer.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observer.current) {
        observer.current.disconnect();
      }
    };
  }, [loading, pageToken, selectedFolder, fetchContacts]);

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffInHours = Math.floor(
        (now.getTime() - date.getTime()) / (1000 * 60 * 60)
      );
      const diffInDays = Math.floor(diffInHours / 24);

      if (diffInHours < 1) return "now";
      if (diffInHours < 24) return `${diffInHours}h ago`;
      if (diffInDays < 7) return `${diffInDays}d ago`;
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  const getProfileImage = (name: string) => {
    const firstLetter = name.charAt(0).toUpperCase() || "U";
    const gradients = [
      "from-blue-500 to-indigo-600",
      "from-indigo-500 to-purple-600",
      "from-emerald-500 to-teal-600",
      "from-amber-500 to-orange-600",
      "from-rose-500 to-pink-600",
      "from-cyan-500 to-blue-600",
    ];
    const colorIndex = (name.charCodeAt(0) || 0) % gradients.length;

    return (
      <div
        className={`w-9 h-9 rounded-full bg-gradient-to-br ${gradients[colorIndex]} flex items-center justify-center text-white font-semibold text-xs shrink-0 shadow-2xs`}
      >
        {firstLetter}
      </div>
    );
  };

  return (
    <div className="w-full bg-white dark:bg-gray-900 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Mobile Drawer Trigger (visible on <md) */}
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(true);
              onOpenDrawer?.();
            }}
            title="Open folder menu"
            aria-label="Open folders navigation drawer"
            className="md:hidden inline-flex items-center justify-center -ml-1.5 p-2.5 min-h-[44px] min-w-[44px] rounded-xl text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <Menu className="w-5 h-5 shrink-0" />
            <span className="sr-only">Open folders menu</span>
          </button>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize tracking-tight truncate min-w-0">
            {selectedFolder.replace("+", " + ")}
          </h2>
        </div>
        {contacts.length > 0 && (
          <span className="text-xs text-gray-400 font-medium shrink-0 ml-2">
            {contacts.length} conversations
          </span>
        )}
      </div>

      {/* Contact List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100/80 dark:divide-gray-800/60">
        {loading && contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 space-y-2">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
            <p className="text-xs text-gray-400">Loading messages&hellip;</p>
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-gray-400 text-xs">No conversations found</p>
          </div>
        ) : (
          <div>
            {contacts.map((contact) => {
              const isSelected = selectedContact?.id === contact.id;

              return (
                <div
                  key={contact.id}
                  onClick={() => handleContactSelect(contact)}
                  className={`px-4 py-3 cursor-pointer transition-colors flex items-start gap-3 border-l-2 ${
                    isSelected
                      ? "bg-indigo-50/70 dark:bg-gray-800/90 border-indigo-600"
                      : "border-transparent hover:bg-gray-50/70 dark:hover:bg-gray-800/40"
                  }`}
                >
                  {/* Profile Avatar */}
                  {getProfileImage(contact.name)}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Top Row: Name and Time */}
                    <div className="flex items-center justify-between mb-0.5">
                      <span
                        className={`text-xs sm:text-sm truncate ${
                          contact.unread
                            ? "font-semibold text-gray-900 dark:text-white"
                            : "font-medium text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {contact.name}
                      </span>
                      <time className="text-[11px] text-gray-400 shrink-0 ml-2 tabular-nums">
                        {formatTimestamp(contact.timestamp)}
                      </time>
                    </div>

                    {/* Snippet Row */}
                    <p
                      className={`text-xs truncate ${
                        contact.unread
                          ? "text-gray-800 dark:text-gray-200 font-medium"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {contact.snippet || "No preview"}
                    </p>
                  </div>

                  {/* Unread indicator */}
                  {contact.unread && (
                    <div className="flex items-center gap-1.5 shrink-0 pt-1">
                      {contact.unreadCount && contact.unreadCount > 1 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded-full leading-none">
                          {contact.unreadCount}
                        </span>
                      )}
                      <div className="w-2 h-2 bg-indigo-600 rounded-full" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Infinite Scroll Trigger */}
            {pageToken && (
              <div ref={loadMoreRef} className="p-3 flex justify-center">
                {loading && (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile Slide-Out Folder Drawer */}
      <MobileFolderDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        selectedFolder={selectedFolder}
        onFolderSelect={(folder) => {
          onFolderSelect?.(folder);
          setDrawerOpen(false);
        }}
        onCompose={() => {
          setDrawerOpen(false);
          handleCompose?.();
        }}
      />
    </div>
  );
}

export default ContactList;
