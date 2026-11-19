import React from "react";
import { Modal, Pressable, Text, View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import type { Track } from "../types";
export function YouTubePlayer({ track, onClose }: { track: Track | null; onClose: () => void }) {
  if (!track) return null;
  const id = track.id.replace(/^yt:/, "");
  return <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <View style={s.root}><Pressable onPress={onClose} style={s.close}><Text style={s.closeText}>Close</Text></Pressable>
      <Text style={s.title}>{track.title}</Text><Text style={s.artist}>{track.artist}</Text>
      <WebView source={{ uri: `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1&playsinline=1` }}
        allowsFullscreenVideo mediaPlaybackRequiresUserAction={false} style={s.web} />
      <Text style={s.note}>Playback is provided by YouTube. Background and CarPlay playback are not available through this embedded player.</Text>
    </View></Modal>;
}
const s = StyleSheet.create({ root:{flex:1,backgroundColor:"#080808",paddingTop:55,paddingHorizontal:18},close:{alignSelf:"flex-end",padding:12},closeText:{color:"#fff"},title:{color:"#fff",fontSize:22,fontWeight:"700"},artist:{color:"#aaa",marginTop:4,marginBottom:18},web:{width:"100%",aspectRatio:16/9,backgroundColor:"#111",flexGrow:0},note:{color:"#999",marginTop:18,lineHeight:20} });
