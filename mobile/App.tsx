import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StatusBar, Text, TextInput, View, Image, ScrollView, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { searchOpenTune } from "./src/services/opentune";
import { loadState, saveState, recordListen } from "./src/services/storage";
import { YouTubePlayer } from "./src/components/YouTubePlayer";
import type { MusicState, Track } from "./src/types";

type Tab = "Home" | "Search" | "Your Library";
export default function App() {
  const [tab,setTab]=useState<Tab>("Home"), [query,setQuery]=useState(""), [results,setResults]=useState<Track[]>([]);
  const [state,setState]=useState<MusicState>({playlists:[],liked:[],history:[],genreCounts:{}});
  const [playing,setPlaying]=useState<Track|null>(null), [loading,setLoading]=useState(false), [error,setError]=useState("");
  useEffect(()=>{loadState().then(setState);},[]);
  useEffect(()=>{saveState(state).catch(()=>{});},[state]);
  const genres=useMemo(()=>Object.entries(state.genreCounts).sort((a,b)=>b[1]-a[1]).slice(0,6),[state.genreCounts]);
  async function search(q=query){setQuery(q);if(!q.trim())return;setLoading(true);setError("");try{setResults(await searchOpenTune(q));}catch(e){setError(e instanceof Error?e.message:"Search failed");}finally{setLoading(false);}}
  function play(track:Track){setPlaying(track);setState(s=>recordListen(s,track));}
  function like(track:Track){setState(s=>({...s,liked:s.liked.includes(track.id)?s.liked.filter(x=>x!==track.id):[...s.liked,track.id]}));}
  function addPlaylist(){const name=`My Playlist ${state.playlists.length+1}`;setState(s=>({...s,playlists:[...s.playlists,{id:Date.now().toString(),name,trackIds:[],updatedAt:Date.now()}]}));}
  const all=[...results,...state.history];
  return <SafeAreaView style={styles.safe}><StatusBar barStyle="light-content"/><ExpoStatusBar style="light"/>
    <LinearGradient colors={["#243b32","#121212","#080808"]} style={StyleSheet.absoluteFill}/>
    <View style={styles.header}><Text style={styles.brand}>STREAMBOX</Text><Text style={styles.sub}>MUSIC</Text></View>
    <View style={styles.tabs}>{(["Home","Search","Your Library"] as Tab[]).map(t=><Pressable key={t} onPress={()=>setTab(t)}><Text style={[styles.tab,tab===t&&styles.activeTab]}>{t}</Text></Pressable>)}</View>
    {tab==="Home"&&<ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Made for you</Text><Text style={styles.muted}>Discover music from YouTube Music via OpenTune.</Text>
      <View style={styles.chips}>{["Pop","Rock","Hip-Hop","Country","R&B","Electronic"].map(g=><Pressable key={g} onPress={()=>{setTab("Search");search(g);}} style={styles.chip}><Text style={styles.chipText}>{g}</Text></Pressable>)}</View>
      <Text style={styles.section}>Your listening patterns</Text><Text style={styles.muted}>{genres.length?genres.map(([g,n])=>`${g} · ${n}`).join("   "):"Play music to build your genre memory."}</Text>
      <Text style={styles.section}>Recently played</Text>{state.history.slice(0,8).map(t=><TrackRow key={t.id} track={t} onPlay={()=>play(t)} onLike={()=>like(t)} liked={state.liked.includes(t.id)}/>)}
    </ScrollView>}
    {tab==="Search"&&<View style={styles.content}><Text style={styles.heading}>Search</Text><TextInput value={query} onChangeText={setQuery} onSubmitEditing={()=>search()} placeholder="Artists, songs, albums" placeholderTextColor="#888" style={styles.input}/><Pressable style={styles.searchBtn} onPress={()=>search()}><Text style={styles.searchBtnText}>Search YouTube Music</Text></Pressable>
      {loading?<ActivityIndicator color="#1ed760"/>:null}{!!error&&<Text style={styles.error}>{error}</Text>}
      <FlatList data={results} keyExtractor={x=>x.id} renderItem={({item})=><TrackRow track={item} onPlay={()=>play(item)} onLike={()=>like(item)} liked={state.liked.includes(item.id)}/>}/>
    </View>}
    {tab==="Your Library"&&<ScrollView contentContainerStyle={styles.content}><Text style={styles.heading}>Your Library</Text><Pressable style={styles.searchBtn} onPress={addPlaylist}><Text style={styles.searchBtnText}>＋ Create playlist</Text></Pressable>
      {state.playlists.map(p=><View key={p.id} style={styles.playlist}><Text style={styles.rowTitle}>{p.name}</Text><Text style={styles.muted}>{p.trackIds.length} songs</Text></View>)}
      <Text style={styles.section}>Liked songs</Text>{all.filter(t=>state.liked.includes(t.id)).map(t=><TrackRow key={t.id} track={t} onPlay={()=>play(t)} onLike={()=>like(t)} liked/>)}
    </ScrollView>}
    {playing&&<Pressable style={styles.mini} onPress={()=>setPlaying(playing)}><View style={{flex:1}}><Text style={styles.rowTitle} numberOfLines={1}>{playing.title}</Text><Text style={styles.muted}>{playing.artist}</Text></View><Text style={styles.muted}>YouTube</Text><Pressable onPress={()=>setPlaying(null)}><Text style={styles.rowTitle}>×</Text></Pressable></Pressable>}
    <View style={styles.bottom}>{(["Home","Search","Your Library"] as Tab[]).map(t=><Pressable key={t} onPress={()=>setTab(t)}><Text style={[styles.bottomText,tab===t&&styles.activeTab]}>{t}</Text></Pressable>)}</View>
    <YouTubePlayer track={playing} onClose={()=>setPlaying(null)}/>
  </SafeAreaView>;
}
function TrackRow({track,onPlay,onLike,liked}:{track:Track;onPlay:()=>void;onLike:()=>void;liked:boolean}){
 return <View style={styles.track}>{track.artwork?<Image source={{uri:track.artwork}} style={styles.art}/>:<View style={styles.art}/>}<Pressable onPress={onPlay} style={{flex:1}}><Text style={styles.rowTitle} numberOfLines={1}>{track.title}</Text><Text style={styles.muted}>{track.artist}</Text></Pressable><Pressable onPress={onLike}><Text style={styles.like}>{liked?"♥":"♡"}</Text></Pressable></View>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:"#080808"},header:{paddingHorizontal:20,paddingTop:12,paddingBottom:16,flexDirection:"row",alignItems:"baseline",gap:8},brand:{color:"#fff",fontSize:22,fontWeight:"900",letterSpacing:2},sub:{color:"#1ed760",fontWeight:"800"},tabs:{flexDirection:"row",justifyContent:"space-around",paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#292929"},tab:{color:"#aaa",fontWeight:"700"},activeTab:{color:"#1ed760"},content:{padding:18,paddingBottom:110},heading:{fontSize:28,color:"#fff",fontWeight:"900",marginBottom:8},muted:{color:"#aaa",fontSize:13},section:{color:"#fff",fontSize:19,fontWeight:"800",marginTop:26,marginBottom:12},chips:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:18},chip:{backgroundColor:"#282828",padding:12,borderRadius:24},chipText:{color:"#fff"},input:{backgroundColor:"#282828",color:"#fff",padding:15,borderRadius:8,marginTop:12},searchBtn:{backgroundColor:"#1ed760",padding:14,borderRadius:30,alignItems:"center",marginVertical:12},searchBtnText:{color:"#000",fontWeight:"900"},error:{color:"#ff7777",padding:8},track:{flexDirection:"row",alignItems:"center",gap:12,paddingVertical:9},art:{width:52,height:52,borderRadius:5,backgroundColor:"#303030"},rowTitle:{color:"#fff",fontWeight:"700"},like:{color:"#1ed760",fontSize:24,padding:8},playlist:{padding:16,backgroundColor:"#202020",borderRadius:8,marginVertical:5},mini:{position:"absolute",bottom:55,left:8,right:8,backgroundColor:"#282828",borderRadius:8,padding:12,flexDirection:"row",alignItems:"center",gap:12},bottom:{position:"absolute",bottom:0,left:0,right:0,backgroundColor:"#101010",paddingVertical:18,flexDirection:"row",justifyContent:"space-around"},bottomText:{color:"#aaa",fontWeight:"700"}});
