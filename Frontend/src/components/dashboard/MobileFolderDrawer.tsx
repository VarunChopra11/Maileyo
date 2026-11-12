import { useState, useEffect } from "react";
import { Drawer } from "vaul";
import {
  Inbox,
  Star,
  Send,
  AlertTriangle,
  FileText,
  Mail,
  Users,
  Tag,
  Trash2,
  Plus,
  X,
  LogOut,
  User,
} from "lucide-react";
import axios from "axios";
import { SidebarFolder } from "@/types/email";
import { useCompose } from "@/context/ComposeContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fetchAuthenticatedUser, getGoogleLoginUrl } from "@/lib/auth";
import { cn } from "@/lib/utils";

export interface MobileFolderDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedFolder: SidebarFolder;
  onFolderSelect: (folder: SidebarFolder) => void;
  onCompose?: () => void;
}

interface AuthenticatedUser {
  email: string;
  name: string;
  picture: string;
  google_id: string;
}

const mobileFolderItems = [
  { id: "Primary+Sent" as SidebarFolder, label: "Primary + Sent", icon: Mail, count: 0 },
  { id: "Inbox:Primary" as SidebarFolder, label: "Primary", icon: Inbox, count: 0 },
  { id: "Inbox:Social" as SidebarFolder, label: "Social", icon: Users, count: 0 },
  { id: "Inbox:Promotions" as SidebarFolder, label: "Promotions", icon: Tag, count: 0 },
  { id: "Starred" as SidebarFolder, label: "Starred", icon: Star, count: 0 },
  { id: "Sent" as SidebarFolder, label: "Sent", icon: Send, count: 0 },
  { id: "Drafts" as SidebarFolder, label: "Drafts", icon: FileText, count: 0 },
  { id: "Spam" as SidebarFolder, label: "Spam", icon: AlertTriangle, count: 0 },
  { id: "Trash" as SidebarFolder, label: "Trash", icon: Trash2, count: 0 },
];

export default function MobileFolderDrawer({
  open,
  onOpenChange,
  selectedFolder,
  onFolderSelect,
  onCompose,
}: MobileFolderDrawerProps) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const composeContext = useCompose();
  const handleCompose = onCompose || composeContext?.openCompose;

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await fetchAuthenticatedUser();
        setUser(userData);
      } catch (error) {
        console.error("Failed to fetch user in MobileFolderDrawer:", error);
      }
    };
    if (open) {
      loadUser();
    }
  }, [open]);

  const handleFolderClick = (folder: SidebarFolder) => {
    onFolderSelect(folder);
    onOpenChange(false);
  };

  const handleComposeClick = () => {
    onOpenChange(false);
    handleCompose?.();
  };

  const handleLogout = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      await axios.post(`${backendUrl}/auth/logout`, {}, { withCredentials: true });
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <Drawer.Root
      direction="left"
      open={open}
      onOpenChange={onOpenChange}
      dismissible={true}
      shouldScaleBackground={false}
      closeThreshold={0.25}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity duration-300" />
        <Drawer.Content
          className="fixed inset-y-0 left-0 z-50 flex h-full w-[285px] max-w-[85vw] flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-2xl focus:outline-none"
          aria-describedby="mobile-drawer-description"
        >
          {/* Accessible Hidden Dialog Headers */}
          <Drawer.Title className="sr-only">Mail Folders Navigation</Drawer.Title>
          <Drawer.Description id="mobile-drawer-description" className="sr-only">
            Select a mailbox folder or draft a new email
          </Drawer.Description>

          {/* Drawer Header: Brand + Close Button */}
          <div className="px-4 py-3.5 border-b border-gray-200/80 dark:border-gray-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <img src="/LogoPNG.png" alt="Maileyo" className="w-7 h-7" />
              <span className="font-bold text-gray-900 dark:text-gray-100 text-base tracking-tight">
                Maileyo
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close navigation drawer"
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <X className="w-5 h-5 shrink-0" />
            </button>
          </div>

          {/* Prominent Compose Trigger Button */}
          <div className="p-3.5 border-b border-gray-200/80 dark:border-gray-800 shrink-0">
            <button
              type="button"
              onClick={handleComposeClick}
              aria-label="Compose new email"
              className="w-full flex items-center justify-center gap-2.5 py-3 px-4 min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-sm hover:shadow-md transition-all duration-200 font-semibold text-sm tracking-wide focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 cursor-pointer"
            >
              <div className="p-1 rounded-md bg-indigo-500/40">
                <Plus className="w-4 h-4 shrink-0" />
              </div>
              <span>Compose</span>
            </button>
          </div>

          {/* Folder Navigation List */}
          <nav className="flex-1 px-2.5 py-3 overflow-y-auto space-y-1 min-h-0">
            {mobileFolderItems.map((item) => {
              const Icon = item.icon;
              const isSelected = selectedFolder === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleFolderClick(item.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-medium transition-colors cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-indigo-500",
                    isSelected
                      ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold shadow-2xs"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        "p-1.5 rounded-lg transition-colors shrink-0",
                        isSelected
                          ? "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400"
                          : "text-gray-500 dark:text-gray-400 group-hover:text-gray-700"
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                    </div>
                    <span className="truncate">{item.label}</span>
                  </div>

                  {/* Active Indicator & Count Badges */}
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {item.count > 0 && (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400">
                        {item.count > 99 ? "99+" : item.count}
                      </span>
                    )}
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                    )}
                  </div>
                </button>
              );
            })}
          </nav>

          {/* User Profile / Logout Section at Bottom */}
          <div className="p-3.5 border-t border-gray-200/80 dark:border-gray-800 shrink-0 bg-gray-50/50 dark:bg-gray-900/50">
            {user ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarImage src={user.picture} alt={user.name} />
                    <AvatarFallback className="bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 text-xs font-medium">
                      {user.name.split(" ").map((n) => n[0]).join("").substring(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {user.name}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {user.email}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Logout"
                  className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label="Logout"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  window.location.href = getGoogleLoginUrl();
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 min-h-[44px] text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <User className="w-4 h-4 shrink-0" />
                <span>Sign in with Google</span>
              </button>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
