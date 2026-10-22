import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

// Every page is lazy-loaded, so the first paint only ships the shell.
const routes: RouteRecordRaw[] = [
  { path: "/", name: "home", component: () => import("@/views/HomeView.vue") },
  { path: "/albums", name: "albums", component: () => import("@/views/AlbumsView.vue") },
  { path: "/artists", name: "artists", component: () => import("@/views/ArtistsView.vue") },
  { path: "/genres", name: "genres", component: () => import("@/views/GenresView.vue") },
  { path: "/genre/:name", name: "genre", component: () => import("@/views/GenreDetailView.vue") },
  {
    path: "/favourites",
    name: "favourites",
    component: () => import("@/views/FavouritesView.vue"),
  },
  { path: "/album/:id", name: "album", component: () => import("@/views/AlbumDetailView.vue") },
  { path: "/artist/:id", name: "artist", component: () => import("@/views/ArtistDetailView.vue") },
  {
    path: "/playlists",
    name: "playlists",
    component: () => import("@/views/PlaylistsView.vue"),
  },
  {
    path: "/playlist/:id",
    name: "playlist",
    component: () => import("@/views/PlaylistDetailView.vue"),
  },
  { path: "/search", name: "search", component: () => import("@/views/SearchView.vue") },
  { path: "/song/:id", name: "song", component: () => import("@/views/SongLinkView.vue") },
  {
    path: "/listen/:artist/:id",
    name: "listen",
    component: () => import("@/views/ListenView.vue"),
  },
  { path: "/recap", name: "recap", component: () => import("@/views/RecapView.vue") },
  { path: "/stats", name: "stats", component: () => import("@/views/StatsView.vue") },
  { path: "/history", name: "history", component: () => import("@/views/HistoryView.vue") },
  { path: "/settings", name: "settings", component: () => import("@/views/SettingsView.vue") },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  // Content scrolls inside .app-scroll, not the window, so reset that instead.
  scrollBehavior() {
    document.querySelector(".app-scroll")?.scrollTo({ top: 0 });
    return false;
  },
});
