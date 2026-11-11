import { useState } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import ContactList from "@/components/dashboard/ContactList";
import ChatArea from "@/components/dashboard/ChatArea";
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

function Dashboard() {
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

  return (
    <div className="flex h-screen bg-gray-100/90 dark:bg-gray-950 overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar
        selectedFolder={state.selectedFolder}
        onFolderSelect={handleFolderSelect}
      />

      {/* Main Panes Container */}
      <main className="flex flex-1 my-3 mr-3 gap-3 overflow-hidden min-w-0">
        {/* Contact List Panel */}
        <aside className="flex flex-col w-80 lg:w-96 rounded-2xl shadow-xs border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shrink-0">
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
          />
        </aside>

        {/* Email Reading & Composer Panel */}
        <section className="flex flex-1 flex-col rounded-2xl shadow-xs border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden min-w-0">
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
          />
        </section>
      </main>
    </div>
  );
}

export default Dashboard;
