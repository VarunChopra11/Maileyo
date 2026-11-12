import { useState, useCallback } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import ContactList from "@/components/dashboard/ContactList";
import ChatArea from "@/components/dashboard/ChatArea";
import ResizableDivider from "@/components/dashboard/ResizableDivider";
import ComposeModal from "@/components/dashboard/ComposeModal";
import { ComposeProvider } from "@/context/ComposeContext";
import {
  DEFAULT_CONTACTS_WIDTH,
  MIN_CONTACTS_WIDTH,
  MAX_CONTACTS_WIDTH,
  getInitialContactsWidth,
  saveContactsWidth,
} from "@/lib/sidebarPersistence";
import { cn } from "@/lib/utils";
import { EmailContact, EmailMessage, SidebarFolder } from "@/types/email";

export interface DashboardState {
  selectedFolder: SidebarFolder;
  selectedContact: EmailContact | null;
  contacts: EmailContact[];
  messages: EmailMessage[];
  contactsLoading: boolean;
  messagesLoading: boolean;
  contactsPageToken: string;
  messagesPageToken: string;
}

function DashboardContent() {
  const [contactsWidth, setContactsWidth] = useState<number>(() => getInitialContactsWidth());
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const [state, setState] = useState<DashboardState>({
    selectedFolder: "Primary+Sent" as SidebarFolder,
    selectedContact: null,
    contacts: [],
    messages: [],
    contactsLoading: false,
    messagesLoading: false,
    contactsPageToken: "",
    messagesPageToken: "",
  });

  const updateState = (updates: Partial<DashboardState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const handleFolderSelect = (folder: SidebarFolder) => {
    updateState({
      selectedFolder: folder,
      selectedContact: null,
      contacts: [],
      messages: [],
      contactsPageToken: "",
      messagesPageToken: "",
    });
  };

  const handleContactSelect = (contact: EmailContact) => {
    updateState({
      selectedContact: contact,
      messages: [],
      messagesPageToken: "",
    });
  };

  const handleMessageSent = (newMessage: EmailMessage) => {
    updateState({
      messages: [...state.messages, newMessage],
    });
  };

  const handleBackToContacts = useCallback(() => {
    updateState({
      selectedContact: null,
      messages: [],
      messagesPageToken: "",
    });
  }, []);

  const handleSidebarResize = useCallback((newWidth: number) => {
    setContactsWidth(newWidth);
  }, []);

  const handleSidebarResizeEnd = useCallback((finalWidth: number) => {
    setContactsWidth(finalWidth);
    saveContactsWidth(finalWidth);
  }, []);

  const handleSidebarReset = useCallback(() => {
    setContactsWidth(DEFAULT_CONTACTS_WIDTH);
    saveContactsWidth(DEFAULT_CONTACTS_WIDTH);
  }, []);

  return (
    <div className="flex h-screen bg-gray-100/90 dark:bg-gray-950 overflow-hidden relative">
      {/* Sidebar Navigation */}
      <Sidebar
        selectedFolder={state.selectedFolder}
        onFolderSelect={handleFolderSelect}
      />

      {/* Main Panes Container */}
      <main className="flex flex-1 m-2 sm:m-3 md:my-3 md:mr-3 md:ml-0 gap-0 overflow-hidden min-w-0">
        {/* Contact List Panel */}
        <aside
          className={cn(
            "flex-col !w-full md:!w-[var(--sidebar-width)] rounded-2xl shadow-xs border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shrink-0",
            state.selectedContact ? "hidden md:flex" : "flex",
            isDragging
              ? "transition-none select-none pointer-events-none"
              : "transition-[width] duration-200 ease-out"
          )}
          style={{
            width: `${contactsWidth}px`,
            "--sidebar-width": `${contactsWidth}px`,
          } as React.CSSProperties}
        >
          <ContactList
            selectedFolder={state.selectedFolder}
            selectedContact={state.selectedContact}
            contacts={state.contacts}
            loading={state.contactsLoading}
            pageToken={state.contactsPageToken}
            onContactSelect={handleContactSelect}
            onContactsUpdate={(contacts, pageToken) =>
              updateState({ contacts, contactsPageToken: pageToken })
            }
            onLoadingChange={(loading) => updateState({ contactsLoading: loading })}
            onFolderSelect={handleFolderSelect}
          />
        </aside>

        {/* Resizable Divider Handle */}
        <ResizableDivider
          width={contactsWidth}
          onResize={handleSidebarResize}
          onResizeEnd={handleSidebarResizeEnd}
          onReset={handleSidebarReset}
          isDragging={isDragging}
          onDraggingChange={setIsDragging}
          minWidth={MIN_CONTACTS_WIDTH}
          maxWidth={MAX_CONTACTS_WIDTH}
          defaultWidth={DEFAULT_CONTACTS_WIDTH}
        />

        {/* Email Reading & Composer Panel */}
        <section
          className={cn(
            "flex-col rounded-2xl shadow-xs border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden min-w-0",
            state.selectedContact
              ? "flex flex-1 w-full md:w-auto"
              : "hidden md:flex md:flex-1"
          )}
        >
          <ChatArea
            selectedContact={state.selectedContact}
            messages={state.messages}
            loading={state.messagesLoading}
            pageToken={state.messagesPageToken}
            onMessagesUpdate={(messages, pageToken) =>
              updateState({ messages, messagesPageToken: pageToken })
            }
            onLoadingChange={(loading) => updateState({ messagesLoading: loading })}
            onMessageSent={handleMessageSent}
            onBackToContacts={handleBackToContacts}
          />
        </section>
      </main>

      {/* Globally Accessible Floating Compose Modal */}
      <ComposeModal
        onMessageSent={handleMessageSent}
        contacts={state.contacts}
      />
    </div>
  );
}

export default function Dashboard() {
  return (
    <ComposeProvider>
      <DashboardContent />
    </ComposeProvider>
  );
}
